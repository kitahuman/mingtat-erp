import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenAIClient } from '../common/openai-client';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';

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

  /**
   * Parse a bank statement PDF using AI vision.
   * Converts each page to an image, then sends to GPT-4.1 vision.
   * Optionally receives company and bank account lists for auto-identification.
   */
  async parsePdf(
    filePath: string,
    companies: any[] = [],
    bankAccounts: any[] = [],
  ): Promise<PdfParseResult> {
    // Convert PDF pages to images
    const pageImages = await this.pdfToImages(filePath);

    if (pageImages.length === 0) {
      throw new BadRequestException('無法讀取 PDF 文件，請確認文件格式正確。');
    }

    // Build the vision message with all page images
    // Limit to first 8 pages to avoid token limits
    const pagesToProcess = pageImages.slice(0, 8);

    const imageMessages: any[] = pagesToProcess.map((imgBase64, idx) => ({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${imgBase64}`,
        detail: 'high',
      },
    }));

    // Build company and bank account context for AI identification
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

    const systemPrompt = `你是一個專業的銀行月結單解析助手。你的任務是從銀行月結單圖片中提取所有交易記錄。

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
- 判斷每筆交易正負號時，必須先讀取 PDF 字面內容中的金額數字，再依照金額出現在 Deposit/Deposits/存入 欄位或 Withdrawal/Withdrawals/提取 欄位的位置判斷正負；**欄位位置是最重要的主要依據**，尤其 HSBC 月結單的欄位順序為 Deposit, Withdrawal, Balance，不可只看數字或描述自行猜測
- 如果金額位於 Deposit/Deposits/存入 欄位，該筆交易必須填入 deposits，amount 必須為正數；如果金額位於 Withdrawal/Withdrawals/提取 欄位，該筆交易必須填入 withdrawals，amount 必須為負數
- 必須用 transaction description 交叉驗證欄位判斷：包含 "ATM WITHDRAWAL"、"WITHDRAWAL"、"CHEQUE"、"CHQ"、"CLEARING CHEQUE"、"CHARGES"、"FEE"、"AUTOPAY"、"PAYMENT"、"TRANSFER OUT" 等語意通常為支出；包含 "CHEQUE DEPOSIT"、"CASH DEPOSIT"、"CASH"、"DEPOSIT"、"TRANSFER IN"、"CREDIT" 等語意通常為存入。注意 "CHEQUE DEPOSIT" 是存入，但單獨 "CHEQUE" 或 "CLEARING CHEQUE" 通常是支出
- 必須盡量使用月結單上的 running balance 驗算交易正負號，但要彈性適應不同銀行格式：如果每筆交易都有 balance，逐筆驗算「前一筆 balance + deposits - withdrawals = 本筆 balance」或「前一筆 balance + amount = 本筆 balance」；第一筆交易以前 opening_balance / B/F BALANCE 作為前一筆 balance
- 如果只有部分交易顯示 balance（例如每天只在最後一筆交易後顯示當日結餘，或只在某些交易行顯示結餘），不要報錯、不要跳過交易，也不要要求每筆都有 balance；應使用相鄰可用 balance 點驗算該段區間的交易總和：前一個可用 balance + 該區間 deposits 總和 - 該區間 withdrawals 總和 = 下一個可用 balance。若區間總和不符，必須檢查並修正該區間內可能判錯正負號的交易
- 如果某些交易前後都沒有可用 balance 可驗算，仍必須輸出該交易，並以 PDF 的 Deposit/Withdrawal 欄位位置為主要依據、transaction description 為交叉驗證依據判斷 deposits、withdrawals 和 amount，不可因無法驗算 balance 而跳過或留空
- 若 PDF 欄位位置、description 語意與可用的 running balance 驗算結果有衝突，優先順序為：1) running balance 驗算結果（銀行計算，一定正確）作為最終判斷；2) PDF 的 Deposit/Withdrawal 欄位位置；3) transaction description。也就是說，在有足夠 balance 資訊時，最終輸出的 withdrawals、deposits、amount 必須能讓 running balance 或可用 balance 區間總和相符
- 特別注意 HSBC ATM 提款案例：例如描述含 "ATM" 或 "ATM WITHDRAWAL"，金額 50,000 位於 Withdrawal 欄，且 balance 較前一筆少 50,000，必須輸出 withdrawals: 50000、deposits: null、amount: -50000，絕不可誤判為存入
- 支票號碼（如 CHEQUE 312928、CHQ NO.001618、CLEARING CHEQUE 200331）提取為 reference_no
- 如果同一日期有多筆交易，每筆都要單獨列出
- 日期統一轉換為 YYYY-MM-DD 格式（如 "2-Feb" 需根據月結單期間判斷年份）
${identificationContext}

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "bank_name": "銀行名稱（如 HSBC、上海商業銀行、中國銀行（香港）、OCBC）",
  "account_no": "帳號（如有）",
  "statement_date": "月結單截止日期 YYYY-MM-DD（如有）",
  "statement_period": "月結單期間（如 2026年2月1日 至 2026年2月28日）",
  "opening_balance": 數字（B/F BALANCE / 承前結餘金額；如沒有則 null）,
  ${companies.length > 0 || bankAccounts.length > 0 ? `"identified_company_name": "識別到的公司名稱或 null",
  "identified_company_id": 數字或null,
  "identified_bank_account_id": 數字或null,
  "identified_bank_account_label": "識別到的銀行帳戶描述或 null",
  ` : ''}"transactions": [
    {
      "date": "YYYY-MM-DD",
      "raw_date": "原始日期字串",
      "description": "交易描述",
      "reference_no": "支票號碼或參考號（如有，否則 null）",
      "withdrawals": 數字（提取金額，正數；如無則 null）,
      "deposits": 數字（存入金額，正數；如無則 null）,
      "amount": 數字（正數=存入，負數=提取，deposits 和 withdrawals 的合計）,
      "balance": 數字（餘額，如有）
    }
  ]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `請解析以下銀行月結單圖片（共 ${pagesToProcess.length} 頁），提取所有交易記錄。`,
              },
              ...imageMessages,
            ],
          },
        ],
        max_tokens: 8000,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response
      let parsed: PdfParseResult;
      try {
        // Remove markdown code blocks if present
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error('[PdfParser] Failed to parse AI response:', content);
        throw new BadRequestException('AI 解析結果格式錯誤，請重試。');
      }

      // Validate and clean transactions
      if (!parsed.transactions || !Array.isArray(parsed.transactions)) {
        throw new BadRequestException('AI 未能識別交易記錄，請確認 PDF 格式正確。');
      }

      // Clean up amounts (remove commas, ensure numbers)
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
          // Derive amount from withdrawals/deposits if not provided
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

      return parsed;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      console.error('[PdfParser] OpenAI error:', err.message);
      throw new BadRequestException(`AI 解析失敗：${err.message}`);
    } finally {
      // Clean up temp images
      pageImages.forEach((_, idx) => {
        const tmpPath = join(tmpdir(), `pdf_page_${idx}.png`);
        if (existsSync(tmpPath)) {
          try { unlinkSync(tmpPath); } catch {}
        }
      });
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
        // pageBuffer is a Buffer of PNG data
        images.push(pageBuffer.toString('base64'));
      }

      return images;
    } catch (err: any) {
      console.error('[PdfParser] pdf-to-img error:', err.message);
      throw new BadRequestException(`PDF 轉換失敗：${err.message}`);
    }
  }
}
