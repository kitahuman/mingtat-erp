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
  transactions: ParsedTransaction[];
  raw_text?: string;
}

@Injectable()
export class PdfParserService {
  private openai = createOpenAIClient();

  /**
   * Parse a bank statement PDF using AI vision.
   * Converts each page to an image, then sends to GPT-4.1 vision.
   */
  async parsePdf(filePath: string): Promise<PdfParseResult> {
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

    const systemPrompt = `你是一個專業的銀行月結單解析助手。你的任務是從銀行月結單圖片中提取所有交易記錄。

支援的銀行格式：
1. **HSBC（匯豐銀行）**：日期格式 DD-Mon（如 31-Jan, 2-Feb），欄位：Date, Details, Deposit, Withdrawal, Balance
2. **上海商業銀行（Shanghai Commercial Bank）**：日期格式 DDMMMYY（如 02MAR26），欄位：DATE, TRANSACTION DETAILS, WITHDRAWALS, DEPOSITS, BALANCE
3. **中國銀行（香港）（Bank of China HK）**：日期格式 YYYY/MM/DD，欄位：交易日期, 交易摘要, 存入, 提取, 結餘
4. **OCBC 銀行（華僑銀行）**：日期格式 DDMMMYY（如 11FEB26），欄位：DATE, PARTICULARS, WITHDRAWAL, DEPOSIT, BALANCE

重要規則：
- 忽略 B/F BALANCE（承前結餘）、C/F BALANCE（結餘）、TRANSACTION TOTAL 等非交易行
- 忽略頁眉、頁腳、廣告、注意事項等非交易內容
- 存入（Deposit/存入）金額為正數，提取（Withdrawal/提取）金額為負數
- 支票號碼（如 CHEQUE 312928、CHQ NO.001618、CLEARING CHEQUE 200331）提取為 reference_no
- 如果同一日期有多筆交易，每筆都要單獨列出
- 日期統一轉換為 YYYY-MM-DD 格式（如 "2-Feb" 需根據月結單期間判斷年份）

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "bank_name": "銀行名稱（如 HSBC、上海商業銀行、中國銀行（香港）、OCBC）",
  "account_no": "帳號（如有）",
  "statement_date": "月結單截止日期 YYYY-MM-DD（如有）",
  "statement_period": "月結單期間（如 2026年2月1日 至 2026年2月28日）",
  "transactions": [
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
