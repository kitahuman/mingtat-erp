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

@Injectable()
export class PdfParserService {
  private openai = createOpenAIClient();

  constructor(private readonly aiActivityLogService: AiActivityLogService) {}

  /**
   * Parse a bank statement PDF.
   * Tries text extraction first; if successful, sends text to AI.
   * Otherwise, falls back to vision-based parsing.
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

    try {
      // Step 1: Try text extraction
      extractedText = await this.extractTextFromPdf(pdfBuffer);
      
      // If text is too short or does not contain meaningful bank statement data,
      // fallback to vision. Some scanned PDFs (e.g. Brother scanner output) may
      // extract only page markers such as "-- 1 of 5 --", which can be longer
      // than the previous length-only threshold but still contain no transaction data.
      if (!extractedText || extractedText.trim().length < 50) {
        console.log('[PdfParser] Extracted text too short, falling back to vision.');
        useVision = true;
      } else if (!this.hasMeaningfulBankStatementText(extractedText)) {
        console.log('[PdfParser] Extracted text lacks meaningful bank statement data, falling back to vision.');
        useVision = true;
      }
    } catch (err) {
      console.error('[PdfParser] Text extraction failed:', err.message);
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

    const systemPrompt = `你是一個專業的銀行月結單解析助手。你的任務是從銀行月結單內容（可能是純文字或圖片）中提取所有交易記錄。

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
- **解析純文字時的特別注意**：文字提取後的格式可能因欄位對齊而包含大量空格，請根據欄位標題與數字的相對位置判斷金額屬於哪一欄。
- 判斷每筆交易正負號時，必須依照金額出現在 Deposit/Deposits/存入 欄位或 Withdrawal/Withdrawals/提取 欄位的位置判斷正負；**欄位位置是最重要的主要依據**。
- 如果金額位於 Deposit/Deposits/存入 欄位，該筆交易必須填入 deposits，amount 必須為正數；如果金額位於 Withdrawal/Withdrawals/提取 欄位，該筆交易必須填入 withdrawals，amount 必須為負數
- 必須用 transaction description 交叉驗證欄位判斷：包含 "ATM WITHDRAWAL"、"WITHDRAWAL"、"CHEQUE"、"CHQ"、"CLEARING CHEQUE"、"CHARGES"、"FEE"、"AUTOPAY"、"PAYMENT"、"TRANSFER OUT" 等語意通常為支出；包含 "CHEQUE DEPOSIT"、"CASH DEPOSIT"、"CASH"、"DEPOSIT"、"TRANSFER IN"、"CREDIT" 等語意通常為存入。
- 必須盡量使用月結單上的 running balance 驗算交易正負號：如果每筆交易都有 balance，逐筆驗算「前一筆 balance + deposits - withdrawals = 本筆 balance」。
- 如果只有部分交易顯示 balance，應使用相鄰可用 balance 點驗算該段區間的交易總和。若區間總和不符，必須檢查並修正該區間內可能判錯正負號或讀錯金額數字的交易。
- running balance 驗算不只用來驗證存入/支出方向，也必須用來核對金額數字本身是否正確。當驗算不符時，AI 應重新檢查數字讀取，並優先以 running balance 的差值作為正確金額依據。
- running balance 是銀行計算結果，必須視為最可靠依據；在有足夠 balance 資訊可驗算時，AI 應以 running balance 修正自己讀取的金額和方向。
- 注意：部分銀行（如 HSBC）的月結單 Balance 欄只在每天最後一筆交易才顯示結餘，不是每筆都有。當某天有多筆交易但只有一個 balance 時，不能用 balance 差值反推個別交易的方向。此時必須以金額出現在 Deposit 欄還是 Withdrawal 欄為準。如果 PDF 表格有明確的 Deposit 和 Withdrawal 分欄，欄位位置永遠優先於 balance 反推。
- 如果同一日期有多筆交易，每筆都要單獨列出。不要因為多筆交易金額相同就跳過，只要 reference_no 或 balance 不同，全部都是獨立交易，必須逐筆輸出。
- 日期統一轉換為 YYYY-MM-DD 格式。
${identificationContext}

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "bank_name": "銀行名稱",
  "account_no": "帳號",
  "statement_date": "YYYY-MM-DD",
  "statement_period": "月結單期間",
  "opening_balance": 數字,
  ${companies.length > 0 || bankAccounts.length > 0 ? `"identified_company_name": "識別到的公司名稱或 null",
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
      } else {
        // Text Mode
        messages.push({
          role: 'user',
          content: `請解析以下從銀行月結單 PDF 提取的文字內容，提取所有交易記錄：\n\n${extractedText.slice(0, 30000)}`, // Limit text length
        });
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: messages,
        max_tokens: 8000,
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

      await this.aiActivityLogService.log({
        module: 'bank_reconciliation',
        action: 'ocr',
        status: 'success',
        inputSummary: `PDF 銀行月結單；解析模式：${useVision ? 'vision' : 'text'}；公司數：${companies.length}；銀行帳戶數：${bankAccounts.length}`,
        outputSummary: `銀行：${parsed.bank_name || '未知'}；帳戶：${parsed.account_no || '未知'}；交易數：${parsed.transactions.length}`,
        tokensUsed: response.usage?.total_tokens ?? null,
        durationMs: Date.now() - startedAt,
        metadata: {
          mode: useVision ? 'vision' : 'text',
          page_image_count: pageImages.length,
          transaction_count: parsed.transactions.length,
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
   *
   * Text extraction from scanned PDFs can return page markers only (for example,
   * "-- 1 of 5 --") without any transaction data. Detect common statement
   * signals such as monetary amounts, dates, and bank/transaction keywords before
   * trusting text mode.
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
      // Monetary amounts such as 1,234.56 or 1234.56.
      /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/,
      /\b\d+\.\d{2}\b/,
      // Common numeric and month-name date formats used by supported statements.
      /\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/,
      /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
      /\b\d{1,2}\s*-?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s*-?\s*\d{0,4}\b/i,
      /\b\d{1,2}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\d{2,4}\b/i,
      // Bank statement and transaction keywords in English and Chinese.
      /(?:銀行|月結單|結單|交易|結餘|餘額|存入|提取|提款|入數|支票|帳戶|賬戶|戶口|匯豐|中國銀行|上海商業|華僑|Bank|Statement|Account|Transaction|Balance|Deposit|Withdrawal|Cheque|Check|HSBC|OCBC)/i,
    ];

    return meaningfulPatterns.some((pattern) => pattern.test(textWithoutPageMarkers));
  }

  /**
   * Extract text content from PDF using pdf-parse.
   */
  private async extractTextFromPdf(dataBuffer: Buffer): Promise<string> {
    // pdf-parse v2 exposes PDFParse class; the v1 callable default export no longer exists.
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
