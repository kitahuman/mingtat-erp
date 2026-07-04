import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { extname } from 'path';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { createOpenAIClient } from '../common/openai-client';

const MODEL_NAME = process.env.BQ_IMPORT_MODEL || 'gpt-4.1';

export interface ParsedBqItem {
  item_no: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  section: string;
}

export interface BqImportParseResult {
  items: ParsedBqItem[];
  sections: string[];
  source_filename: string;
  total_amount: number;
  warnings: string[];
}

@Injectable()
export class BqImportService {
  private readonly openai = createOpenAIClient();

  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // Step 1: Parse uploaded file (PDF / Excel) → LLM → structured items
  // ────────────────────────────────────────────────────────────
  async parseFile(file: Express.Multer.File): Promise<BqImportParseResult> {
    if (!file) throw new BadRequestException('請上傳文件');

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = extname(originalName || file.originalname).toLowerCase();

    let text = '';
    if (ext === '.pdf' || file.mimetype === 'application/pdf') {
      text = await this.extractTextFromPdf(file.buffer);
    } else if (['.xlsx', '.xls'].includes(ext) || /spreadsheet|excel/i.test(file.mimetype)) {
      text = await this.extractTextFromExcel(file.buffer);
    } else {
      throw new BadRequestException('只支援 PDF (.pdf) 或 Excel (.xlsx, .xls) 文件');
    }

    if (!text || text.trim().length < 20) {
      throw new BadRequestException('無法從文件提取文字內容（可能是掃描圖片 PDF），請確認文件格式');
    }

    const items = await this.parseWithLlm(text, originalName);

    // Post-process: clean numbers, compute amount, dedupe sections
    const warnings: string[] = [];
    const cleaned = items
      .filter((it) => (it.item_no && it.item_no.trim()) || (it.description && it.description.trim()))
      .map((it, idx) => {
        const quantity = this.toNumber(it.quantity);
        const rate = this.toNumber(it.rate);
        let amount = this.toNumber(it.amount);
        const computed = parseFloat((quantity * rate).toFixed(2));
        if (amount === 0 && computed !== 0) amount = computed;
        if (amount !== 0 && computed !== 0 && Math.abs(amount - computed) > 0.05) {
          warnings.push(`項目 ${it.item_no || `#${idx + 1}`}：金額 ${amount} 與 數量×單價 ${computed} 不一致`);
        }
        return {
          item_no: (it.item_no || '').toString().trim() || String(idx + 1),
          description: (it.description || '').toString().trim(),
          quantity,
          unit: (it.unit || '').toString().trim(),
          rate,
          amount,
          section: (it.section || '').toString().trim(),
        };
      });

    // Dedupe item_no (unique per contract): append suffix for duplicates
    const seen = new Map<string, number>();
    for (const it of cleaned) {
      const key = it.item_no;
      const count = seen.get(key) || 0;
      if (count > 0) {
        it.item_no = `${key}(${count + 1})`;
        warnings.push(`項目編號 ${key} 重複，已自動改為 ${it.item_no}`);
      }
      seen.set(key, count + 1);
    }

    const sections = Array.from(new Set(cleaned.map((i) => i.section).filter((s) => s)));
    const totalAmount = parseFloat(cleaned.reduce((s, i) => s + i.amount, 0).toFixed(2));

    return {
      items: cleaned,
      sections,
      source_filename: originalName,
      total_amount: totalAmount,
      warnings,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Step 2: Confirm import → create sections + items in one transaction
  // ────────────────────────────────────────────────────────────
  async confirmImport(contractId: number, items: ParsedBqItem[]) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('請至少選擇一個項目');
    }

    // Resolve / create sections by name
    const sectionNames = Array.from(
      new Set(items.map((i) => (i.section || '').trim()).filter((s) => s)),
    );

    const existingSections = await this.prisma.contractBqSection.findMany({
      where: { contract_id: contractId },
    });
    const sectionIdByName = new Map<string, number>();
    for (const sec of existingSections) {
      sectionIdByName.set(sec.section_name.trim(), sec.id);
    }

    let maxSectionSort = existingSections.reduce((m, s) => Math.max(m, s.sort_order), 0);
    const usedCodes = new Set(existingSections.map((s) => s.section_code));

    for (const name of sectionNames) {
      if (sectionIdByName.has(name)) continue;
      const code = this.generateSectionCode(name, usedCodes);
      usedCodes.add(code);
      maxSectionSort++;
      const created = await this.prisma.contractBqSection.create({
        data: {
          contract_id: contractId,
          section_code: code,
          section_name: name.slice(0, 200),
          sort_order: maxSectionSort,
        },
      });
      sectionIdByName.set(name, created.id);
    }

    // Create items
    let maxSort =
      (
        await this.prisma.contractBqItem.aggregate({
          where: { contract_id: contractId },
          _max: { sort_order: true },
        })
      )._max.sort_order || 0;

    const createdItems: any[] = [];
    const skipped: string[] = [];

    for (const dto of items) {
      const itemNo = (dto.item_no || '').toString().trim().slice(0, 30);
      if (!itemNo) {
        skipped.push(dto.description?.slice(0, 30) || '(無編號)');
        continue;
      }
      const existing = await this.prisma.contractBqItem.findUnique({
        where: { contract_id_item_no: { contract_id: contractId, item_no: itemNo } },
      });
      if (existing) {
        skipped.push(itemNo);
        continue;
      }

      const quantity = this.toNumber(dto.quantity);
      const rate = this.toNumber(dto.rate);
      let amount = this.toNumber(dto.amount);
      const computed = parseFloat((quantity * rate).toFixed(2));
      if (computed !== 0) amount = computed;
      maxSort++;

      const sectionName = (dto.section || '').trim();
      const item = await this.prisma.contractBqItem.create({
        data: {
          contract_id: contractId,
          section_id: sectionName ? sectionIdByName.get(sectionName) || null : null,
          item_no: itemNo,
          description: (dto.description || '').toString(),
          quantity,
          unit: (dto.unit || '').toString().trim().slice(0, 20) || null,
          unit_rate: rate,
          amount,
          sort_order: maxSort,
        },
      });
      createdItems.push(item);
    }

    // Sync contract original_amount
    const sum = await this.prisma.contractBqItem.aggregate({
      where: { contract_id: contractId, status: 'active' },
      _sum: { amount: true },
    });
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { original_amount: sum._sum.amount || 0 },
    });

    return {
      created: createdItems.length,
      skipped: skipped.length,
      skipped_item_nos: skipped,
      sections_created: sectionNames.length,
    };
  }

  // ────────────────────────────────────────────────────────────
  // Text extraction helpers
  // ────────────────────────────────────────────────────────────

  /**
   * Extract text from PDF using pdfjs-dist with positional line grouping.
   * Items on the same visual line are joined with " | " separators so that
   * the LLM can recognise table columns.
   */
  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const pdfjsLib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    // In Node.js/Docker, pdfjs-dist 5.x requires a file:// URL for workerSrc.
    const workerPath = path.resolve(
      __dirname,
      '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
    const data = new Uint8Array(buffer);
    const doc = await pdfjsLib.getDocument({ data }).promise;

    const pages: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const items: any[] = (textContent.items as any[]).filter((i) => i.str && i.str.trim());

      // Group items into visual lines by Y coordinate (tolerance 3pt)
      const lines: { y: number; parts: { x: number; str: string }[] }[] = [];
      for (const it of items) {
        const x = it.transform[4];
        const y = it.transform[5];
        let line = lines.find((l) => Math.abs(l.y - y) <= 3);
        if (!line) {
          line = { y, parts: [] };
          lines.push(line);
        }
        line.parts.push({ x, str: it.str.trim() });
      }
      lines.sort((a, b) => b.y - a.y);
      const pageLines = lines.map((l) =>
        l.parts
          .sort((a, b) => a.x - b.x)
          .map((pp) => pp.str)
          .join(' | '),
      );
      pages.push(`=== 第 ${p} 頁 ===\n${pageLines.join('\n')}`);
    }
    return pages.join('\n\n');
  }

  /** Extract text from Excel: one pipe-delimited line per non-empty row. */
  private async extractTextFromExcel(buffer: Buffer): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('無法讀取 Excel 文件，請確認是 .xlsx 格式（舊版 .xls 請先另存為 .xlsx）');
    }

    const sheets: string[] = [];
    workbook.eachSheet((worksheet) => {
      const rows: string[] = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          values.push(this.cellToString(cell));
        });
        const line = values.join(' | ').replace(/\s+\|\s+(?=\|)/g, ' |');
        if (line.replace(/[|\s]/g, '').length > 0) {
          rows.push(`R${rowNumber}: ${line}`);
        }
      });
      if (rows.length > 0) {
        sheets.push(`=== 工作表: ${worksheet.name} ===\n${rows.join('\n')}`);
      }
    });
    return sheets.join('\n\n');
  }

  private cellToString(cell: ExcelJS.Cell): string {
    const v = cell.value as any;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((r: any) => r.text).join('');
      if (v.result !== undefined && v.result !== null) return String(v.result);
      if (v.text) return String(v.text);
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return '';
    }
    return String(v).trim();
  }

  // ────────────────────────────────────────────────────────────
  // LLM parsing
  // ────────────────────────────────────────────────────────────
  private async parseWithLlm(text: string, filename: string): Promise<ParsedBqItem[]> {
    // Cap input size; BQ files are usually well under this
    const MAX_CHARS = 120000;
    const truncated = text.length > MAX_CHARS;
    const input = truncated ? text.slice(0, MAX_CHARS) : text;

    const systemPrompt = `你是建築工程 BQ（Bill of Quantities，工程量清單）文件解析專家。用戶會提供從 PDF 或 Excel 提取的 BQ / 報價單 / SOR 文字內容（欄位以 " | " 分隔），請提取所有工程項目為結構化 JSON。

每個項目包含：
- item_no：項目編號，保留原始格式（如 "1.1.1", "A", "3.1)", "1/14_2A"）。若沒有編號但明顯是一個計價項目，留空字串。
- description：工程摘要/描述。多行描述（延續行沒有編號、數量）必須合併到同一項目的 description 中，用空格或換行連接。
- quantity：數量（數字）。沒有則為 0。
- unit：單位（如 m2, m3, m, nr, no., kg, Item, L.S., 個, 單, 項 等）。保留原始寫法。沒有則空字串。
- rate：單價（數字）。空白或未填（如待投標人填寫）則為 0。
- amount：金額（數字）。空白則為 0。
- section：所屬分部名稱。從文件的層級結構推斷，例如章節標題 "EARTHWORKS"、"Site Clearance"、"SECTION 10 - FORMWORK"、"1.1 工程皮費"、"Part 2.2" 等。同一分部下的所有項目使用相同的 section 名稱。若無法判斷分部，用空字串。

必須遵守的規則：
1. 只提取實際的計價項目（有編號或有數量/單價/金額的行）。
2. 分部/章節標題本身不是項目，不要作為項目輸出，而是作為其下項目的 section。
3. 忽略：重複的表頭行（如 "項目 | 工程摘要 | 數量 | 單位 | 單價 | 金額"、"Item | Description | Qty | Unit | Rate | Amount"）、頁碼、公司名稱、日期、標書編號、"Carried Forward"/"Brought Forward"/承前/轉下頁、小計/合計/總計行、條款說明文字（如 MPF 供款說明、保險條款等沒有編號和數量的純文字段落）。
4. 數字可能含千位逗號（如 "1,234.56"），輸出時去除逗號轉為數字。
5. "(Rate Only)" 項目照樣提取，quantity 為 0。
6. 標註 "不適用" / "N/A" / "Excl." 的項目仍然提取，數值欄位為 0，可在 description 保留該標註。
7. Excel 行首的 "R123:" 是行號標記，不要包含在輸出中。
8. 按文件中出現的順序輸出項目。`;

    const response = await this.openai.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `文件名稱：${filename}${truncated ? '\n（內容過長已截斷）' : ''}\n\n文件內容：\n${input}`,
        },
      ],
      temperature: 0,
      max_tokens: 32000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'bq_import_items',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item_no: { type: 'string' },
                    description: { type: 'string' },
                    quantity: { type: 'number' },
                    unit: { type: 'string' },
                    rate: { type: 'number' },
                    amount: { type: 'number' },
                    section: { type: 'string' },
                  },
                  required: ['item_no', 'description', 'quantity', 'unit', 'rate', 'amount', 'section'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      console.error('[BqImport] Failed to parse LLM response:', content.slice(0, 500));
      throw new BadRequestException('AI 解析結果格式錯誤，請重試');
    }
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      throw new BadRequestException('AI 未能識別 BQ 項目，請確認文件內容');
    }
    return parsed.items as ParsedBqItem[];
  }

  // ────────────────────────────────────────────────────────────
  // Misc helpers
  // ────────────────────────────────────────────────────────────
  private toNumber(v: any): number {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /** Generate a unique section_code (max 20 chars) from a section name. */
  private generateSectionCode(name: string, used: Set<string>): string {
    // Try leading code patterns e.g. "1.1 工程皮費" → "1.1", "SECTION 10 - FORMWORK" → "S10"
    let base = '';
    const numMatch = name.match(/^([A-Za-z0-9.\-/]+)\s/);
    const secMatch = name.match(/^SECTION\s+(\w+)/i);
    const partMatch = name.match(/^PART\s+([\w.]+)/i);
    if (secMatch) base = `S${secMatch[1]}`;
    else if (partMatch) base = `P${partMatch[1]}`;
    else if (numMatch && /\d/.test(numMatch[1])) base = numMatch[1];
    else {
      // Use first meaningful characters of the name
      base = name.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g, '').slice(0, 8) || 'SEC';
    }
    base = base.slice(0, 16);
    let code = base;
    let i = 2;
    while (used.has(code)) {
      code = `${base}-${i}`;
      i++;
      if (code.length > 20) {
        code = code.slice(0, 20);
      }
    }
    return code;
  }
}
