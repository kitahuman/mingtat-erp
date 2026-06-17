import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenAIClient } from '../common/openai-client';
import { AiActivityLogService } from '../ai-activity-log/ai-activity-log.service';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface ParsedTransaction {
  date: string;          // ISO date string YYYY-MM-DD
  description: string;
  reference_no?: string;
  amount: number;        // positive = deposit, negative = withdrawal
  withdrawals?: number;  // withdrawal amount (positive number)
  deposits?: number;     // deposit amount (positive number)
  balance?: number;
  raw_date?: string;     // original date string from PDF
}

export interface PdfParseResult {
  bank_name: string;
  account_no?: string;
  statement_date?: string;
  statement_period?: string;  // e.g. "2026年2月1日 至 2026年2月28日"
  opening_balance?: number | null; // B/F BALANCE 承前結餘
  transactions: ParsedTransaction[];
  raw_text?: string;
  // AI-identified company and account info
  identified_company_name?: string;
  identified_company_id?: number;
  identified_bank_account_id?: number;
  identified_bank_account_label?: string;
}

interface ColumnBoundaries {
  depositX: number;
  withdrawalX: number;
  balanceX: number;
}

/**
 * A structured row extracted from a PDF page using positional data.
 * Amounts are already classified by column — AI only needs to fill text fields.
 */
interface StructuredRow {
  rowIndex: number;
  textParts: string;        // Non-amount text on this line (date, description, ref)
  depositAmount?: number;   // Amount in the Deposit column
  withdrawalAmount?: number; // Amount in the Withdrawal column
  balanceAmount?: number;   // Amount in the Balance column
}

@Injectable()
export class PdfParserService {
  private openai = createOpenAIClient();

  constructor(private readonly aiActivityLogService: AiActivityLogService) {}

  /**
   * Parse a bank statement PDF.
   * For text-extractable PDFs: uses pdfjs-dist positional data to determine column assignment,
   * then sends pre-classified structured rows to AI for date/description extraction only.
   * For scanned/image PDFs: falls back to vision-based parsing.
   */
  async parsePdf(
    fileInput: string | Buffer | { path?: string; buffer?: Buffer; originalname?: string },
    companies: any[] = [],
    bankAccounts: any[] = [],
  ): Promise<PdfParseResult> {
    const startedAt = Date.now();
    const normalizedFile = this.normalizePdfInput(fileInput);
    const filePath = normalizedFile.filePath;
    const pdfBuffer = normalizedFile.buffer;
    let extractedText = '';
    let useVision = false;
    let structuredRows: StructuredRow[] = [];

    try {
      // Step 1: Try text extraction
      extractedText = await this.extractTextFromPdf(pdfBuffer);

      if (!extractedText || extractedText.trim().length < 50) {
        console.log('[PdfParser] Extracted text too short, falling back to vision.');
        useVision = true;
      } else if (!this.hasMeaningfulBankStatementText(extractedText)) {
        console.log('[PdfParser] Extracted text lacks meaningful bank statement data, falling back to vision.');
        useVision = true;
      }

      // Step 2: If text mode, try positional extraction to get structured rows
      if (!useVision) {
        try {
          structuredRows = await this.extractStructuredRows(pdfBuffer);
          if (structuredRows.length > 0) {
            console.log(`[PdfParser] Positional extraction found ${structuredRows.length} rows.`);
          }
        } catch (err: any) {
          console.log('[PdfParser] Positional extraction failed, using plain text:', err.message);
        }
      }
    } catch (err) {
      console.error('[PdfParser] Text extraction failed:', (err as Error).message);
      useVision = true;
    }

    // Build identification context for AI
    let identificationContext = '';
    if (companies.length > 0 || bankAccounts.length > 0) {
      identificationContext = `\n\n## 公司和銀行帳戶識別

請根據月結單上的帳戶持有人名稱、帳號、銀行名稱等資訊，嘗試識別這份月結單屬於哪間公司和哪個銀行帳戶。

系統中已有的公司列表：
${companies.map((c: any) => `- ID: ${c.id}, 名稱: ${c.name}${c.name_en ? ` (${c.name_en})` : ''}`).join('\n')}

系統中已有的銀行帳戶列表：
${bankAccounts.map((a: any) => `- ID: ${a.id}, 銀行: ${a.bank_name}, 帳戶名: ${a.account_name}, 帳號: ${a.account_no}, 公司ID: ${a.company_id || '無'}`).join('\n')}

在 JSON 回應中請額外包含：
- "identified_company_name": "識別到的公司名稱（如有）",
- "identified_company_id": 對應的公司ID（如能匹配，否則 null）,
- "identified_bank_account_id": 對應的銀行帳戶ID（如能匹配，否則 null）,
- "identified_bank_account_label": "識別到的銀行帳戶描述（如 HSBC - 123-456789-001）"`;
    }

    const hasStructuredData = structuredRows.length > 0;
    const systemPrompt = this.buildSystemPrompt(identificationContext, companies.length > 0 || bankAccounts.length > 0, hasStructuredData);

    let pageImages: string[] = [];
    try {
      let messages: any[] = [
        {
          role: 'system',
          content: systemPrompt,
        }
      ];

      if (useVision) {
        // Vision Mode
        pageImages = await this.pdfToImages(filePath);
        if (pageImages.length === 0) {
          throw new BadRequestException('無法讀取 PDF 文件內容。');
        }
        const pagesToProcess = pageImages.slice(0, 8);
        const imageMessages = pagesToProcess.map((imgBase64) => ({
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${imgBase64}`,
            detail: 'high',
          },
        }));

        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `請解析以下銀行月結單圖片（共 ${pagesToProcess.length} 頁），提取所有交易記錄。`,
            },
            ...imageMessages,
          ],
        });
      } else if (hasStructuredData) {
        // Structured Mode: amounts already classified by x-coordinate
        // AI only needs to extract date, description, reference_no from textParts
        const structuredText = this.formatStructuredRowsForAI(structuredRows);
        messages.push({
          role: 'user',
          content: `以下是從銀行月結單 PDF 提取的結構化資料。每行的金額欄位（deposit_amount、withdrawal_amount、balance_amount）已由程式根據 PDF 欄位 x 座標精確確定，請勿修改這些金額值或方向。你只需要從 text_parts 中提取 date、description、reference_no，並按照指定格式輸出。

${structuredText}`,
        });
      } else {
        // Plain text mode fallback
        messages.push({
          role: 'user',
          content: `請解析以下從銀行月結單 PDF 提取的文字內容，提取所有交易記錄：\n\n${extractedText.slice(0, 50000)}`,
        });
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: messages,
        max_tokens: 16000,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response
      let parsed: PdfParseResult;
      try {
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error('[PdfParser] Failed to parse AI response:', content);
        throw new BadRequestException('AI 解析結果格式錯誤，請重試。');
      }

      // Validate and clean transactions
      if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
        throw new BadRequestException('AI 未能識別交易記錄。');
      }

      const cleanNum = (v: any): number | undefined => {
        if (v == null) return undefined;
        const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : Number(v);
        return isNaN(n) ? undefined : n;
      };

      parsed.opening_balance = cleanNum(parsed.opening_balance) ?? null;

      if (hasStructuredData) {
        // In structured mode: override AI's amount fields with our pre-classified values
        // Match by row_index if provided, otherwise by position
        parsed.transactions = this.mergeStructuredAmounts(parsed.transactions, structuredRows, cleanNum);
      } else {
        parsed.transactions = parsed.transactions
          .filter(tx => tx.date && (tx.amount !== undefined || tx.withdrawals !== undefined || tx.deposits !== undefined))
          .map(tx => {
            const withdrawals = cleanNum(tx.withdrawals);
            const deposits = cleanNum(tx.deposits);
            let amount = cleanNum(tx.amount);
            if (amount === undefined) {
              if (deposits != null && deposits > 0) amount = deposits;
              else if (withdrawals != null && withdrawals > 0) amount = -withdrawals;
              else amount = 0;
            }
            return {
              ...tx,
              withdrawals: withdrawals && withdrawals > 0 ? withdrawals : undefined,
              deposits: deposits && deposits > 0 ? deposits : undefined,
              amount,
              balance: cleanNum(tx.balance),
              reference_no: tx.reference_no || undefined,
            };
          });
      }

      // Step 3: Post-processing balance verification (catches any remaining issues)
      parsed.transactions = this.verifyAndFixBalances(parsed.transactions, parsed.opening_balance);

      await this.aiActivityLogService.log({
        module: 'bank_reconciliation',
        action: 'ocr',
        status: 'success',
        inputSummary: `PDF 銀行月結單；解析模式：${useVision ? 'vision' : hasStructuredData ? 'text+structured' : 'text'}；公司數：${companies.length}；銀行帳戶數：${bankAccounts.length}`,
        outputSummary: `銀行：${parsed.bank_name || '未知'}；帳戶：${parsed.account_no || '未知'}；交易數：${parsed.transactions.length}`,
        tokensUsed: response.usage?.total_tokens ?? null,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: useVision ? 'vision' : hasStructuredData ? 'text+structured' : 'text',
          page_image_count: pageImages.length,
          transaction_count: parsed.transactions.length,
          structured_rows: structuredRows.length,
          identified_company_id: parsed.identified_company_id,
          identified_bank_account_id: parsed.identified_bank_account_id,
          prompt_tokens: response.usage?.prompt_tokens,
          completion_tokens: response.usage?.completion_tokens,
        },
      });
      return parsed;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      await this.aiActivityLogService.log({
        module: 'bank_reconciliation',
        action: 'ocr',
        status: 'error',
        inputSummary: `PDF 銀行月結單；解析模式：${useVision ? 'vision' : 'text'}；公司數：${companies.length}；銀行帳戶數：${bankAccounts.length}`,
        outputSummary: '銀行月結單 OCR/解析失敗',
        durationMs: Date.now() - startedAt,
        errorMessage: message,
        metadata: {
          mode: useVision ? 'vision' : 'text',
          page_image_count: pageImages.length,
        },
      });
      if (err instanceof BadRequestException) throw err;
      console.error('[PdfParser] Parsing error:', message);
      throw new BadRequestException(`解析失敗：${message}`);
    } finally {
      // Clean up temp images if any
      pageImages.forEach((_, idx) => {
        const tmpPath = join(tmpdir(), `pdf_page_${idx}.png`);
        if (existsSync(tmpPath)) {
          try { unlinkSync(tmpPath); } catch {}
        }
      });
      if (normalizedFile.shouldCleanupPath && filePath && existsSync(filePath)) {
        try { unlinkSync(filePath); } catch {}
      }
    }
  }

  /**
   * Extract structured rows from PDF using pdfjs-dist positional data.
   * Each row contains pre-classified amounts (deposit/withdrawal/balance) and raw text parts.
   * This is the core improvement: amounts are classified by x-coordinate, not by AI.
   */
  private async extractStructuredRows(pdfBuffer: Buffer): Promise<StructuredRow[]> {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    // Disable Worker to avoid version mismatch between pdfjs-dist API and Worker file.
    // pdf-parse (a dependency) ships its own older pdfjs-dist version which can conflict.
    // For text extraction, running in the main thread is perfectly fine.
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const data = new Uint8Array(pdfBuffer);
    const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;

    let globalBoundaries: ColumnBoundaries | null = null;
    const allRows: StructuredRow[] = [];
    let rowIndex = 0;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const items: any[] = textContent.items.filter((i: any) => i.str && i.str.trim());

      // Detect column headers on this page
      const boundaries = this.detectColumnBoundaries(items);
      if (boundaries) {
        globalBoundaries = boundaries;
      }

      if (!globalBoundaries) {
        continue; // Skip pages before we find column headers
      }

      // Sort items: top to bottom, left to right
      const sortedItems = [...items].sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      // Group into lines
      const lines: any[][] = [];
      let currentLine: any[] = [];
      let currentY = -1;

      for (const item of sortedItems) {
        const y = item.transform[5];
        if (currentY < 0 || Math.abs(y - currentY) > 3) {
          if (currentLine.length > 0) lines.push(currentLine);
          currentLine = [item];
          currentY = y;
        } else {
          currentLine.push(item);
        }
      }
      if (currentLine.length > 0) lines.push(currentLine);

      // Process each line
      for (const line of lines) {
        let textParts = '';
        let depositAmount: number | undefined;
        let withdrawalAmount: number | undefined;
        let balanceAmount: number | undefined;
        let hasAnyAmount = false;

        for (const item of line) {
          const str = item.str.trim();
          const x = item.transform[4];

          if (/^[\d,]+\.\d{2}$/.test(str)) {
            hasAnyAmount = true;
            const value = parseFloat(str.replace(/,/g, ''));
            const col = this.classifyAmountColumn(x, globalBoundaries);
            if (col === 'DEPOSIT') {
              depositAmount = value;
            } else if (col === 'WITHDRAWAL') {
              withdrawalAmount = value;
            } else if (col === 'BALANCE') {
              balanceAmount = value;
            }
          } else {
            textParts += (textParts ? ' ' : '') + str;
          }
        }

        // Only include lines that have at least one amount (transaction lines)
        // or lines that look like they could be header/date rows with text
        if (hasAnyAmount || this.looksLikeTransactionText(textParts)) {
          allRows.push({
            rowIndex: rowIndex++,
            textParts: textParts.trim(),
            depositAmount,
            withdrawalAmount,
            balanceAmount,
          });
        }
      }
    }

    return allRows;
  }

  /**
   * Check if text looks like it could be part of a transaction row.
   */
  private looksLikeTransactionText(text: string): boolean {
    if (!text || text.trim().length < 3) return false;
    // Date patterns, transaction descriptions
    return /\d{1,2}[-/]\w{3}|\d{2}[A-Z]{3}\d{2}|\d{4}[-/]\d{2}[-/]\d{2}|B\/F|C\/F/i.test(text);
  }

  /**
   * Format structured rows as a compact text representation for AI.
   * AI only needs to fill date, description, reference_no from textParts.
   */
  private formatStructuredRowsForAI(rows: StructuredRow[]): string {
    const lines: string[] = [];
    lines.push('ROW_INDEX | TEXT_PARTS | DEPOSIT_AMOUNT | WITHDRAWAL_AMOUNT | BALANCE_AMOUNT');
    lines.push('-'.repeat(80));
    for (const row of rows) {
      const dep = row.depositAmount != null ? row.depositAmount.toFixed(2) : '';
      const wit = row.withdrawalAmount != null ? row.withdrawalAmount.toFixed(2) : '';
      const bal = row.balanceAmount != null ? row.balanceAmount.toFixed(2) : '';
      lines.push(`${row.rowIndex} | ${row.textParts} | ${dep} | ${wit} | ${bal}`);
    }
    return lines.join('\n');
  }

  /**
   * Merge AI-extracted text fields (date, description, reference_no) with
   * backend-classified amounts. The backend amounts ALWAYS take precedence.
   *
   * Strategy:
   * 1. Filter structuredRows to only those with actual transaction amounts
   * 2. Try row_index matching first (if AI provided it)
   * 3. Fall back to sequential position matching (AI transaction N → structuredRow N)
   * 4. If no match at all, still use backend amounts from the closest row
   *    (never fall back to AI-determined amounts in structured mode)
   */
  private mergeStructuredAmounts(
    aiTransactions: ParsedTransaction[],
    structuredRows: StructuredRow[],
    cleanNum: (v: any) => number | undefined,
  ): ParsedTransaction[] {
    // Only keep rows that have at least one transaction amount
    const txRows = structuredRows.filter(
      r => r.depositAmount != null || r.withdrawalAmount != null
    );

    // Build a map from row_index to structured row
    const rowMap = new Map<number, StructuredRow>();
    for (const row of txRows) {
      rowMap.set(row.rowIndex, row);
    }

    const result: ParsedTransaction[] = [];
    // Track which txRows have been used for sequential fallback
    let seqIndex = 0;

    for (const tx of aiTransactions) {
      if (!tx.date) continue;

      // Try row_index matching first
      const rowIdx = (tx as any).row_index;
      let structuredRow: StructuredRow | undefined = rowIdx != null ? rowMap.get(rowIdx) : undefined;

      // If row_index matching failed, use sequential position matching
      if (!structuredRow && seqIndex < txRows.length) {
        structuredRow = txRows[seqIndex];
      }

      if (structuredRow) {
        seqIndex = txRows.indexOf(structuredRow) + 1;
        // Use backend-classified amounts — NEVER use AI amounts in structured mode
        const deposits = structuredRow.depositAmount != null && structuredRow.depositAmount > 0
          ? structuredRow.depositAmount : undefined;
        const withdrawals = structuredRow.withdrawalAmount != null && structuredRow.withdrawalAmount > 0
          ? structuredRow.withdrawalAmount : undefined;
        const balance = structuredRow.balanceAmount;
        const amount = deposits ? deposits : withdrawals ? -withdrawals : 0;

        result.push({
          date: tx.date,
          raw_date: tx.raw_date,
          description: tx.description,
          reference_no: tx.reference_no || undefined,
          deposits,
          withdrawals,
          amount,
          balance,
        });
      }
      // If no structuredRow found at all, skip this transaction
      // (better to miss a transaction than to include one with wrong direction)
    }

    return result.filter(tx => tx.amount !== 0 || tx.deposits || tx.withdrawals);
  }

  /**
   * Build the system prompt for AI parsing.
   */
  private buildSystemPrompt(identificationContext: string, hasIdentification: boolean, hasStructuredData: boolean): string {
    if (hasStructuredData) {
      // Structured mode: AI only extracts text fields, amounts are pre-classified
      return `你是一個專業的銀行月結單解析助手。本次解析已由程式從 PDF 中精確提取了每行的金額及其所屬欄位（存入/提取/結餘），你只需要從每行的 TEXT_PARTS 中提取以下文字欄位：

- date：交易日期，轉換為 YYYY-MM-DD 格式
- raw_date：原始日期字串（如 "4-May", "04MAY26"）
- description：交易描述（去除日期和金額後的文字）
- reference_no：支票號碼或參考號（如有，否則 null）
- row_index：對應輸入資料的 ROW_INDEX 欄位值（整數，必須填入）

**重要規則：**
- 每個輸入行的 DEPOSIT_AMOUNT、WITHDRAWAL_AMOUNT、BALANCE_AMOUNT 已由程式精確確定，你必須原封不動地使用這些值，不要修改
- 忽略 B/F BALANCE 行（作為 opening_balance 提取），忽略 C/F BALANCE 行，忽略頁眉頁腳
- 如果某行只有 BALANCE_AMOUNT 而沒有 DEPOSIT 或 WITHDRAWAL，且描述包含 "B/F BALANCE"，則提取為 opening_balance 而非交易
- 同一日期的多筆交易必須全部單獨列出
- 日期可能只出現在當天第一筆交易，後續同日交易沿用同一日期
${identificationContext}

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "bank_name": "銀行名稱",
  "account_no": "帳號",
  "statement_date": "YYYY-MM-DD",
  "statement_period": "月結單期間",
  "opening_balance": 數字,
  ${hasIdentification ? `"identified_company_name": "識別到的公司名稱或 null",
  "identified_company_id": 數字或null,
  "identified_bank_account_id": 數字或null,
  "identified_bank_account_label": "識別到的銀行帳戶描述或 null",
  ` : ''}"transactions": [
    {
      "row_index": 整數,
      "date": "YYYY-MM-DD",
      "raw_date": "原始日期字串",
      "description": "交易描述",
      "reference_no": "支票號碼或參考號或null",
      "withdrawals": 數字或null,
      "deposits": 數字或null,
      "amount": 數字,
      "balance": 數字或null
    }
  ]
}`;
    }

    // Vision or plain text mode
    return `你是一個專業的銀行月結單解析助手。你的任務是從銀行月結單內容（可能是純文字或圖片）中提取所有交易記錄。

支援的銀行格式：
1. **HSBC（匯豐銀行）**：日期格式 DD-Mon（如 31-Jan, 2-Feb），欄位：Date, Details, Deposit, Withdrawal, Balance
2. **上海商業銀行（Shanghai Commercial Bank）**：日期格式 DDMMMYY（如 02MAR26），欄位：DATE, TRANSACTION DETAILS, WITHDRAWALS, DEPOSITS, BALANCE
3. **中國銀行（香港）（Bank of China HK）**：日期格式 YYYY/MM/DD，欄位：交易日期, 交易摘要, 存入, 提取, 結餘
4. **OCBC 銀行（華僑銀行）**：日期格式 DDMMMYY（如 11FEB26），欄位：DATE, PARTICULARS, WITHDRAWAL, DEPOSIT, BALANCE

重要規則：
- 忽略 C/F BALANCE（結餘）、TRANSACTION TOTAL 等非交易行
- B/F BALANCE（承前結餘）不作為交易行，但必須提取其金額作為 opening_balance
- 忽略頁眉、頁腳、廣告、注意事項等非交易內容
- 存入（Deposit/存入）金額為正數，提取（Withdrawal/提取）金額為負數
- 判斷每筆交易正負號時，必須依照金額出現在 Deposit/Deposits/存入 欄位或 Withdrawal/Withdrawals/提取 欄位的位置判斷正負；**欄位位置是最重要的主要依據**。
- 如果金額位於 Deposit/Deposits/存入 欄位，該筆交易必須填入 deposits，amount 必須為正數；如果金額位於 Withdrawal/Withdrawals/提取 欄位，該筆交易必須填入 withdrawals，amount 必須為負數
- 必須盡量使用月結單上的 running balance 驗算交易正負號。
- 注意：部分銀行（如 HSBC）的月結單 Balance 欄只在每天最後一筆交易才顯示結餘，不是每筆都有。當某天有多筆交易但只有一個 balance 時，不能用 balance 差值反推個別交易的方向。此時必須以金額出現在 Deposit 欄還是 Withdrawal 欄為準。
- 如果同一日期有多筆交易，每筆都要單獨列出。
- 日期統一轉換為 YYYY-MM-DD 格式。
${identificationContext}

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "bank_name": "銀行名稱",
  "account_no": "帳號",
  "statement_date": "YYYY-MM-DD",
  "statement_period": "月結單期間",
  "opening_balance": 數字,
  ${hasIdentification ? `"identified_company_name": "識別到的公司名稱或 null",
  "identified_company_id": 數字或null,
  "identified_bank_account_id": 數字或null,
  "identified_bank_account_label": "識別到的銀行帳戶描述或 null",
  ` : ''}"transactions": [
    {
      "date": "YYYY-MM-DD",
      "raw_date": "原始日期字串",
      "description": "交易描述",
      "reference_no": "支票號碼或參考號",
      "withdrawals": 數字,
      "deposits": 數字,
      "amount": 數字,
      "balance": 數字
    }
  ]
}`;
  }

  /**
   * Detect column header positions from text items on a page.
   */
  private detectColumnBoundaries(items: any[]): ColumnBoundaries | null {
    let depositX: number | null = null;
    let withdrawalX: number | null = null;
    let balanceX: number | null = null;

    for (const item of items) {
      const str = item.str.trim().toLowerCase();
      const x = item.transform[4];

      if (str === 'deposit' || str === 'deposits') {
        depositX = x;
      } else if (str === 'withdrawal' || str === 'withdrawals') {
        withdrawalX = x;
      } else if ((str === 'balance' || str.startsWith('balance in')) && x > 250) {
        balanceX = x;
      }
    }

    if (depositX == null || withdrawalX == null || balanceX == null) {
      return null;
    }

    return { depositX, withdrawalX, balanceX };
  }

  /**
   * Classify an amount into a column based on its x position.
   */
  private classifyAmountColumn(x: number, boundaries: ColumnBoundaries): string {
    const cols = [
      { name: 'DEPOSIT', x: boundaries.depositX },
      { name: 'WITHDRAWAL', x: boundaries.withdrawalX },
      { name: 'BALANCE', x: boundaries.balanceX },
    ].sort((a, b) => a.x - b.x);

    const midpoint1 = (cols[0].x + cols[1].x) / 2;
    const midpoint2 = (cols[1].x + cols[2].x) / 2;

    if (x < midpoint1) return cols[0].name;
    if (x < midpoint2) return cols[1].name;
    return cols[2].name;
  }

  /**
   * Post-processing: verify and fix transaction directions using running balance.
   * This is a safety net for any remaining issues (e.g. vision mode or plain text mode).
   */
  private verifyAndFixBalances(transactions: ParsedTransaction[], openingBalance: number | null | undefined): ParsedTransaction[] {
    if (!transactions.length || openingBalance == null) return transactions;

    let runningBalance = openingBalance;
    let fixCount = 0;
    const MAX_FIXES = 10;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const deposit = tx.deposits || 0;
      const withdrawal = tx.withdrawals || 0;

      const expectedBalance = runningBalance + deposit - withdrawal;

      if (tx.balance != null) {
        const diff = Math.abs(expectedBalance - tx.balance);

        if (diff > 0.01 && fixCount < MAX_FIXES) {
          const flippedBalance = runningBalance - deposit + withdrawal;
          const flippedDiff = Math.abs(flippedBalance - tx.balance);

          if (flippedDiff < 0.01) {
            console.log(`[PdfParser] Balance fix: flipping tx #${i + 1} "${tx.description}" - was deposit=${deposit}/withdrawal=${withdrawal}, now deposit=${withdrawal}/withdrawal=${deposit}`);
            const newDeposit = withdrawal > 0 ? withdrawal : undefined;
            const newWithdrawal = deposit > 0 ? deposit : undefined;
            transactions[i] = {
              ...tx,
              deposits: newDeposit,
              withdrawals: newWithdrawal,
              amount: newDeposit ? newDeposit : newWithdrawal ? -newWithdrawal : 0,
            };
            runningBalance = flippedBalance;
            fixCount++;
          } else {
            runningBalance = tx.balance;
          }
        } else {
          runningBalance = expectedBalance;
        }
      } else {
        runningBalance = expectedBalance;
      }
    }

    if (fixCount > 0) {
      console.log(`[PdfParser] Post-processing fixed ${fixCount} transaction direction(s).`);
    }

    return transactions;
  }

  /**
   * Normalize uploaded PDF input into a Buffer for text parsing and a path for vision fallback.
   */
  private normalizePdfInput(fileInput: string | Buffer | { path?: string; buffer?: Buffer; originalname?: string }): { buffer: Buffer; filePath: string; shouldCleanupPath: boolean } {
    if (Buffer.isBuffer(fileInput)) {
      const tmpPath = join(tmpdir(), `bank_statement_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      writeFileSync(tmpPath, fileInput);
      return { buffer: fileInput, filePath: tmpPath, shouldCleanupPath: true };
    }

    if (typeof fileInput === 'string') {
      return { buffer: readFileSync(fileInput), filePath: fileInput, shouldCleanupPath: false };
    }

    if (fileInput?.buffer && Buffer.isBuffer(fileInput.buffer)) {
      const tmpPath = fileInput.path || join(tmpdir(), `bank_statement_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
      if (!fileInput.path) writeFileSync(tmpPath, fileInput.buffer);
      return { buffer: fileInput.buffer, filePath: tmpPath, shouldCleanupPath: !fileInput.path };
    }

    if (fileInput?.path) {
      return { buffer: readFileSync(fileInput.path), filePath: fileInput.path, shouldCleanupPath: false };
    }

    throw new BadRequestException('PDF 文件內容無效：未能取得上傳文件的 buffer 或 path。');
  }

  /**
   * Check whether extracted PDF text contains meaningful bank statement content.
   */
  private hasMeaningfulBankStatementText(text: string): boolean {
    const textWithoutPageMarkers = text
      .replace(/--\s*\d+\s*(?:of|\/)\s*\d+\s*--/gi, ' ')
      .replace(/\bpage\s*\d+\s*(?:of|\/)\s*\d+\b/gi, ' ')
      .replace(/第\s*\d+\s*頁\s*(?:共\s*\d+\s*頁)?/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (textWithoutPageMarkers.length < 20) {
      return false;
    }

    const meaningfulPatterns = [
      /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/,
      /\b\d+\.\d{2}\b/,
      /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,
      /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
      /\b\d{1,2}\s*-?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s*-?\s*\d{0,4}\b/i,
      /\b\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\d{2,4}\b/i,
      /(?:銀行|月結單|結單|交易|結餘|餘額|存入|提取|提款|入數|支票|帳戶|賬戶|戶口|匯豐|中國銀行|上海商業|華僑|Bank|Statement|Account|Transaction|Balance|Deposit|Withdrawal|Cheque|Check|HSBC|OCBC)/i,
    ];

    return meaningfulPatterns.some((pattern) => pattern.test(textWithoutPageMarkers));
  }

  /**
   * Extract text content from PDF using pdf-parse.
   */
  private async extractTextFromPdf(dataBuffer: Buffer): Promise<string> {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: dataBuffer });
    try {
      const data = await parser.getText();
      return data.text || '';
    } finally {
      await parser.destroy();
    }
  }

  /**
   * Convert PDF to array of base64-encoded PNG images (one per page).
   */
  private async pdfToImages(filePath: string): Promise<string[]> {
    try {
      const { pdf } = await import('pdf-to-img') as any;
      const document = await pdf(filePath, { scale: 2.5 });
      const images: string[] = [];
      for await (const pageBuffer of document) {
        images.push(pageBuffer.toString('base64'));
      }
      return images;
    } catch (err: any) {
      console.error('[PdfParser] pdf-to-img error:', err.message);
      throw new BadRequestException(`PDF 轉換失敗：${err.message}`);
    }
  }
}
