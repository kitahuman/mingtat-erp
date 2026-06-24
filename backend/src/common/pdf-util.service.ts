import { Injectable } from '@nestjs/common';
import puppeteer, { PDFOptions, Viewport } from 'puppeteer';

/**
 * 共用的 PDF 產生選項。
 * - `pdfOptions` 直接傳遞給 Puppeteer 的 `page.pdf()`，讓各 PDF Service
 *   可自行指定 page size、margin、header/footer 等設定。
 * - `viewport` 可覆寫預設的 A4 視窗大小（預設 794x1123、deviceScaleFactor 1）。
 */
export interface RenderPdfOptions {
  pdfOptions?: PDFOptions;
  viewport?: Viewport;
}

const DEFAULT_VIEWPORT: Viewport = {
  width: 794,
  height: 1123,
  deviceScaleFactor: 1,
};

@Injectable()
export class PdfUtilService {
  /**
   * 以共用的 Puppeteer 設定啟動瀏覽器，將 HTML 渲染為 PDF buffer。
   *
   * 這個方法抽取了原本 4 個 PDF Service 中重複的 Puppeteer 啟動代碼
   * （launch args、page setup、setContent → page.pdf）。各 Service 仍可
   * 透過 `options.pdfOptions` 傳入自己的 page size、margin、header/footer 等設定。
   */
  async renderHtmlToPdf(
    html: string,
    options: RenderPdfOptions = {},
  ): Promise<Buffer> {
    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport(options.viewport ?? DEFAULT_VIEWPORT);
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf(options.pdfOptions);
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
