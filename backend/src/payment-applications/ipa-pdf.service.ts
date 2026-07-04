import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfUtilService } from '../common/pdf-util.service';

/**
 * IPA PDF 產生服務。
 * 以伺服器端 HTML 複製前端列印頁 (contracts/[id]/pa/[paId]/print) 的版面：
 *   Page 1 — Payment Summary（付款申請匯總）
 *   Page 2 — BQ Detail（Applied Workdone 明細）
 *   Page 3 — VO Detail（如有）
 * 再交由共用的 PdfUtilService（Puppeteer）渲染為 PDF buffer。
 */
@Injectable()
export class IpaPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfUtil: PdfUtilService,
  ) {}

  async generateIpaPdf(contractId: number, paId: number) {
    const { ipa, html } = await this.buildIpaHtmlData(contractId, paId);

    const pdf = await this.pdfUtil.renderHtmlToPdf(html, {
      pdfOptions: {
        format: 'A4',
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; color: #666; padding: 0 10mm; display: flex; justify-content: space-between; align-items: center;">
            <span>${this.escapeHtml(ipa.reference || '')}</span>
            <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
          </div>
        `,
        margin: { top: '0', right: '0', bottom: '14mm', left: '0' },
      },
    });

    return { pdf, ipa };
  }

  // ═══════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════

  async fetchIpaData(contractId: number, paId: number) {
    const ipa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
      include: {
        contract: {
          select: {
            id: true,
            contract_no: true,
            contract_name: true,
            description: true,
            original_amount: true,
            retention_rate: true,
            retention_cap_rate: true,
            advance_payment_rate: true,
            advance_payment_amount: true,
            client: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, project_no: true, project_name: true } },
        bq_progress: {
          include: {
            bq_item: {
              include: {
                section: {
                  select: { id: true, section_code: true, section_name: true },
                },
              },
            },
          },
          orderBy: { bq_item: { sort_order: 'asc' } },
        },
        vo_progress: {
          include: {
            vo_item: {
              include: {
                variation_order: {
                  select: { id: true, vo_no: true, title: true },
                },
              },
            },
          },
        },
      },
    });
    if (!ipa) throw new NotFoundException('IPA 不存在');

    const ipaList = await this.prisma.paymentApplication.findMany({
      where: { contract_id: contractId },
      orderBy: { pa_no: 'asc' },
    });

    const firstProfile = await this.prisma.companyProfile.findFirst({
      where: { status: 'active' },
      select: { chinese_name: true, english_name: true },
      orderBy: { code: 'asc' },
    });
    const companyName =
      firstProfile?.english_name || firstProfile?.chinese_name || '';

    return { ipa, ipaList, companyName };
  }

  // ═══════════════════════════════════════════════════════════
  // HTML building
  // ═══════════════════════════════════════════════════════════

  private async buildIpaHtmlData(contractId: number, paId: number) {
    const { ipa, ipaList, companyName } = await this.fetchIpaData(
      contractId,
      paId,
    );
    const calc = this.buildCalculations(ipa, ipaList);
    const html = this.buildHtml(ipa, calc, companyName);
    return { ipa, html };
  }

  /**
   * Advance payment release + previously certified breakdowns.
   * 與前端 print/page.tsx 的計算邏輯保持一致。
   */
  buildCalculations(ipa: any, ipaList: any[]) {
    const toNum = (v: any) => Number(v) || 0;

    const advancePaymentAmount = toNum(ipa.contract?.advance_payment_amount);
    const advancePaymentRate = toNum(ipa.contract?.advance_payment_rate);

    // Previously certified breakdowns（取最後一期已認證/已收款的前期 IPA）
    const priorIpas = (ipaList || [])
      .filter(
        (row: any) =>
          row.status !== 'void' &&
          toNum(row.pa_no) < toNum(ipa.pa_no) &&
          ['certified', 'paid'].includes(row.status),
      )
      .sort((a: any, b: any) => toNum(a.pa_no) - toNum(b.pa_no));
    const lastPrior =
      priorIpas.length > 0 ? priorIpas[priorIpas.length - 1] : null;

    const prevBqWorkDone = toNum(lastPrior?.bq_work_done);
    const prevVoWorkDone = toNum(lastPrior?.vo_work_done);
    const prevTotalWorkDone = prevBqWorkDone + prevVoWorkDone;
    const prevRetention = toNum(lastPrior?.retention_amount);
    const prevContraCharges = toNum(lastPrior?.other_deductions);
    const prevAdvancePayment =
      advancePaymentAmount > 0 && lastPrior ? advancePaymentAmount : 0;

    const bqWorkDone = toNum(ipa.bq_work_done);
    const voWorkDone = toNum(ipa.vo_work_done);
    const totalWorkDone = bqWorkDone + voWorkDone;
    const retention = toNum(ipa.retention_amount);
    const contraCharges = toNum(ipa.other_deductions);

    const contractSum = toNum(ipa.contract?.original_amount);
    const hasAdvance = advancePaymentAmount > 0 && advancePaymentRate > 0;

    // Release of Advance = 累計 VALUE OF MEASURED WORKDONE × advance rate
    // 與 Excel 參考公式一致：-bqWorkDone × rate（Previously = -prevBqWorkDone × rate）
    const appAdvance = hasAdvance ? advancePaymentAmount : 0;
    const appRelease = hasAdvance ? -(bqWorkDone * advancePaymentRate) : 0;
    const prevRelease = hasAdvance ? -(prevBqWorkDone * advancePaymentRate) : 0;

    const appGrand =
      totalWorkDone +
      (hasAdvance ? appAdvance + appRelease : 0) -
      retention -
      contraCharges;
    const prevGrand =
      prevTotalWorkDone +
      (hasAdvance ? prevAdvancePayment + prevRelease : 0) -
      prevRetention -
      prevContraCharges;
    const amountDue = appGrand - prevGrand;

    return {
      advancePaymentAmount,
      advancePaymentRate,
      hasAdvance,
      bqWorkDone,
      voWorkDone,
      totalWorkDone,
      retention,
      contraCharges,
      contractSum,
      appAdvance,
      appRelease,
      prevRelease,
      prevBqWorkDone,
      prevVoWorkDone,
      prevTotalWorkDone,
      prevRetention,
      prevContraCharges,
      prevAdvancePayment,
      amountDue,
    };
  }

  private buildHtml(ipa: any, calc: any, companyName: string) {
    const projectTitle =
      ipa.contract?.description || ipa.contract?.contract_name || '';
    const subcontractWorks = ipa.contract?.contract_name || '';
    const paLine = `Payment Application No.${ipa.pa_no} (up to ${this.fmtDate(ipa.period_to)})`;

    type SummaryRow = {
      no: string;
      label: string;
      app: number | null;
      prev: number | null;
      subtotal?: boolean;
    };
    const rows: SummaryRow[] = [
      {
        no: '1.1)',
        label: 'VALUE OF MEASURED WORKDONE',
        app: calc.bqWorkDone,
        prev: calc.prevBqWorkDone,
      },
      {
        no: '1.2)',
        label: 'VALUE OF VARIATION',
        app: calc.voWorkDone,
        prev: calc.prevVoWorkDone,
      },
      { no: '1.3)', label: 'Daily', app: null, prev: null },
      {
        no: '',
        label: 'TOTAL VALUE OF WORKDONE  (1.1 to 1.3):',
        app: calc.totalWorkDone,
        prev: calc.prevTotalWorkDone,
        subtotal: true,
      },
      {
        no: '2.1)',
        label: `Advance payment (${this.pct(calc.advancePaymentRate)} of Contract Sum)`,
        app: calc.hasAdvance ? calc.appAdvance : null,
        prev: calc.hasAdvance ? calc.prevAdvancePayment : null,
      },
      {
        no: '2.2)',
        label: `Release of Advance payment (${this.pct(calc.advancePaymentRate)} of Workdone)`,
        app: calc.hasAdvance ? calc.appRelease : null,
        prev: calc.hasAdvance ? calc.prevRelease : null,
      },
      {
        no: '',
        label: 'SUBTOTAL  (2.1 to 2.2):',
        app: calc.hasAdvance ? calc.appAdvance + calc.appRelease : null,
        prev: calc.hasAdvance ? calc.prevAdvancePayment + calc.prevRelease : null,
        subtotal: true,
      },
      {
        no: '3.1)',
        label: 'Retention',
        app: calc.retention > 0 ? -calc.retention : null,
        prev: calc.prevRetention > 0 ? -calc.prevRetention : null,
      },
      { no: '3.2)', label: 'LESS RETENTION', app: null, prev: null },
      {
        no: '',
        label: 'SUBTOTAL  (3.1 to 3.2):',
        app: calc.retention > 0 ? -calc.retention : null,
        prev: calc.prevRetention > 0 ? -calc.prevRetention : null,
        subtotal: true,
      },
      {
        no: '4)',
        label: 'Less Contra Charges',
        app: calc.contraCharges > 0 ? -calc.contraCharges : null,
        prev: calc.prevContraCharges > 0 ? -calc.prevContraCharges : null,
      },
      {
        no: '',
        label: 'SUBTOTAL  (4):',
        app: calc.contraCharges > 0 ? -calc.contraCharges : null,
        prev: calc.prevContraCharges > 0 ? -calc.prevContraCharges : null,
        subtotal: true,
      },
    ];

    const outstanding = (
      app: number | null,
      prev: number | null,
    ): number | null => {
      if (app === null && prev === null) return null;
      return Number(app || 0) - Number(prev || 0);
    };

    const summaryRowsHtml = rows
      .map((row) => {
        const out = outstanding(row.app, row.prev);
        if (row.subtotal) {
          return `
            <tr class="subtotal-row">
              <td></td>
              <td class="right label-cell">${this.escapeHtml(row.label)}</td>
              <td class="right mono bordered">${row.app === null ? '-' : this.fmtNum(row.app)}</td>
              <td class="right mono bordered">${row.prev === null ? '-' : this.fmtNum(row.prev)}</td>
              <td class="right mono bordered">${out === null ? '-' : this.fmtNum(out)}</td>
            </tr>`;
        }
        return `
          <tr>
            <td class="no-cell">${this.escapeHtml(row.no)}</td>
            <td>${this.escapeHtml(row.label)}</td>
            <td class="right mono">${row.app === null ? '-' : this.fmtNum(row.app)}</td>
            <td class="right mono">${row.prev === null ? '-' : this.fmtNum(row.prev)}</td>
            <td class="right mono">${out === null ? '-' : this.fmtNum(out)}</td>
          </tr>`;
      })
      .join('');

    // ── BQ detail grouped by section ──
    const bqGrouped: Record<string, { section: any; items: any[] }> = {};
    (ipa.bq_progress || []).forEach((item: any) => {
      const sKey = item.bq_item?.section?.section_code || '_none';
      if (!bqGrouped[sKey]) {
        bqGrouped[sKey] = {
          section:
            item.bq_item?.section || { section_code: '', section_name: '未分類' },
          items: [],
        };
      }
      bqGrouped[sKey].items.push(item);
    });

    const totalContractAmount = (ipa.bq_progress || []).reduce(
      (s: number, i: any) =>
        s + Number(i.bq_item?.quantity || 0) * Number(i.unit_rate || 0),
      0,
    );
    const totalAppliedAmount = (ipa.bq_progress || []).reduce(
      (s: number, i: any) => s + Number(i.current_amount || 0),
      0,
    );

    const bqRowsHtml = Object.entries(bqGrouped)
      .map(([sKey, group]) => {
        const sectionRow = `
          <tr>
            <td class="bx"></td>
            <td class="bx section-title" colspan="9">${this.escapeHtml(
              [group.section.section_code, group.section.section_name]
                .filter(Boolean)
                .join(' '),
            )}</td>
          </tr>`;
        const itemRows = group.items
          .map((item: any) => {
            const contractQty = Number(item.bq_item?.quantity || 0);
            const rate = Number(item.unit_rate || 0);
            const itemAmount = contractQty * rate;
            return `
              <tr>
                <td class="bx center top">${this.escapeHtml(item.bq_item?.item_no || '')}</td>
                <td class="bx top pre-wrap">${this.escapeHtml(item.bq_item?.description || '')}</td>
                <td class="bx right top mono">${this.fmtQty(contractQty)}</td>
                <td class="bx center top">${this.escapeHtml(item.bq_item?.unit || '')}</td>
                <td class="bx right top mono">${this.fmtNum(rate)}</td>
                <td class="bx right top mono">${this.fmtNum(itemAmount)}</td>
                <td class="bx right top mono">${this.fmtQty(item.prev_cumulative_qty)}</td>
                <td class="bx right top mono">${this.fmtQty(item.this_period_qty)}</td>
                <td class="bx right top mono">${this.fmtQty(item.current_cumulative_qty)}</td>
                <td class="bx right top mono">${this.fmtNum(item.current_amount)}</td>
              </tr>`;
          })
          .join('');
        return sectionRow + itemRows;
      })
      .join('');

    const bqSectionHtml =
      Object.keys(bqGrouped).length > 0
        ? `
      <section class="ipa-page ipa-page-landscape page-break">
        <div class="detail-header">
          <p class="bold underline">${this.escapeHtml(projectTitle)}</p>
          ${
            subcontractWorks && subcontractWorks !== projectTitle
              ? `<p class="bold underline">${this.escapeHtml(subcontractWorks)}</p>`
              : ''
          }
          <p class="bold underline">${this.escapeHtml(paLine)}</p>
        </div>
        <table class="bq-table">
          <thead>
            <tr>
              <th colspan="6" class="bd"></th>
              <th colspan="4" class="bd center bold">Applied Workdone</th>
            </tr>
            <tr>
              <th class="bd w-item">Item</th>
              <th class="bd w-desc">Description</th>
              <th class="bd w-qty">Qty</th>
              <th class="bd w-unit">Unit</th>
              <th class="bd w-rate">Rate</th>
              <th class="bd w-amt">Amount</th>
              <th class="bd w-qty">Previous</th>
              <th class="bd w-qty">Current</th>
              <th class="bd w-qty">Accumulated</th>
              <th class="bd w-amt">Amount (HK$)</th>
            </tr>
          </thead>
          <tbody>
            ${bqRowsHtml}
            <tr class="bold">
              <td class="bd" colspan="5"></td>
              <td class="bd right mono">${this.fmtNum(totalContractAmount)}</td>
              <td class="bd" colspan="3"></td>
              <td class="bd right mono">${this.fmtNum(totalAppliedAmount)}</td>
            </tr>
          </tbody>
        </table>
      </section>`
        : '';

    // ── VO detail grouped by VO ──
    const voGrouped: Record<string, { vo: any; items: any[] }> = {};
    (ipa.vo_progress || []).forEach((item: any) => {
      const voKey = item.vo_item?.variation_order?.vo_no || '_none';
      if (!voGrouped[voKey]) {
        voGrouped[voKey] = {
          vo: item.vo_item?.variation_order || { vo_no: '', title: '' },
          items: [],
        };
      }
      voGrouped[voKey].items.push(item);
    });

    const voTotalContract = (ipa.vo_progress || []).reduce(
      (s: number, i: any) =>
        s + Number(i.vo_item?.quantity || 0) * Number(i.unit_rate || 0),
      0,
    );

    const voRowsHtml = Object.entries(voGrouped)
      .map(([voKey, group]) => {
        const voHeaderRow = `
          <tr>
            <td class="bx"></td>
            <td class="bx section-title" colspan="9">${this.escapeHtml(
              [group.vo.vo_no, group.vo.title].filter(Boolean).join(' - '),
            )}</td>
          </tr>`;
        const itemRows = group.items
          .map((item: any) => {
            const voQty = Number(item.vo_item?.quantity || 0);
            const rate = Number(item.unit_rate || 0);
            return `
              <tr>
                <td class="bx center top">${this.escapeHtml(item.vo_item?.item_no || '')}</td>
                <td class="bx top pre-wrap">${this.escapeHtml(item.vo_item?.description || '')}</td>
                <td class="bx right top mono">${this.fmtQty(voQty)}</td>
                <td class="bx center top">${this.escapeHtml(item.vo_item?.unit || '')}</td>
                <td class="bx right top mono">${this.fmtNum(rate)}</td>
                <td class="bx right top mono">${this.fmtNum(voQty * rate)}</td>
                <td class="bx right top mono">${this.fmtQty(item.prev_cumulative_qty)}</td>
                <td class="bx right top mono">${this.fmtQty(item.this_period_qty)}</td>
                <td class="bx right top mono">${this.fmtQty(item.current_cumulative_qty)}</td>
                <td class="bx right top mono">${this.fmtNum(item.current_amount)}</td>
              </tr>`;
          })
          .join('');
        return voHeaderRow + itemRows;
      })
      .join('');

    const voSectionHtml =
      Object.keys(voGrouped).length > 0
        ? `
      <section class="ipa-page ipa-page-landscape page-break">
        <div class="detail-header">
          <p class="bold underline">${this.escapeHtml(projectTitle)}</p>
          <p class="bold underline">${this.escapeHtml(paLine)} — Variation Orders</p>
        </div>
        <table class="bq-table">
          <thead>
            <tr>
              <th colspan="6" class="bd"></th>
              <th colspan="4" class="bd center bold">Applied Workdone</th>
            </tr>
            <tr>
              <th class="bd w-item">Item</th>
              <th class="bd w-desc">Description</th>
              <th class="bd w-qty">Qty</th>
              <th class="bd w-unit">Unit</th>
              <th class="bd w-rate">Rate</th>
              <th class="bd w-amt">Amount</th>
              <th class="bd w-qty">Previous</th>
              <th class="bd w-qty">Current</th>
              <th class="bd w-qty">Accumulated</th>
              <th class="bd w-amt">Amount (HK$)</th>
            </tr>
          </thead>
          <tbody>
            ${voRowsHtml}
            <tr class="bold">
              <td class="bd" colspan="5"></td>
              <td class="bd right mono">${this.fmtNum(voTotalContract)}</td>
              <td class="bd" colspan="3"></td>
              <td class="bd right mono">${this.fmtNum(ipa.vo_work_done)}</td>
            </tr>
          </tbody>
        </table>
      </section>`
        : '';

    return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <title>${this.escapeHtml(ipa.reference || `IPA-${ipa.pa_no}`)}</title>
  <style>
    /* Portrait for page 1 (Payment Summary) */
    @page          { size: A4 portrait;  margin: 12mm; }
    /* Landscape for BQ/VO detail pages */
    @page landscape { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0; background: #ffffff; color: #000000;
      font-family: "Noto Sans CJK TC", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", Arial, sans-serif;
      font-size: 12px;
    }
    p { margin: 0; }
    .bold { font-weight: 700; }
    .underline { text-decoration: underline; }
    .right { text-align: right; }
    .center { text-align: center; }
    .top { vertical-align: top; }
    .mono { font-family: "SF Mono", "Roboto Mono", "Courier New", monospace; }
    .pre-wrap { white-space: pre-wrap; }
    .blue { color: #1e40af; font-weight: 500; }

    .header-block { margin-bottom: 14px; }
    .header-block .title { font-weight: 700; line-height: 1.35; }
    .header-block .pa-line { font-weight: 700; text-decoration: underline; margin-top: 4px; }

    .meta-wrap { display: flex; justify-content: space-between; margin-bottom: 14px; }
    .meta-table td { padding: 2px 0; vertical-align: top; }
    .meta-table td.label { padding-right: 16px; white-space: nowrap; }
    .meta-table td.value-right { text-align: right; white-space: nowrap; }
    .subcontract-sum { display: flex; margin-bottom: 20px; }
    .subcontract-sum .label { width: 176px; }

    table.summary-table { width: 100%; border-collapse: collapse; }
    table.summary-table th {
      text-align: center; font-weight: 700; text-decoration: underline;
      padding-bottom: 8px; vertical-align: bottom; line-height: 1.25;
    }
    table.summary-table td { padding: 5px 6px; }
    .no-cell { width: 40px; vertical-align: top; color: #1f2937; }
    .subtotal-row { font-weight: 700; }
    .subtotal-row .label-cell { background: #e5e7eb; padding-right: 8px; }
    .subtotal-row .bordered {
      background: #e5e7eb;
      border-top: 1px solid #6b7280; border-bottom: 1px solid #6b7280;
    }
    .amount-due-label { text-align: right; padding-right: 8px; white-space: nowrap; font-weight: 700; padding-top: 24px; }
    .amount-due-value {
      text-align: right; font-weight: 700; padding-top: 24px;
      border-top: 2px solid #1f2937; border-bottom: 6px double #1f2937;
    }

    /* ── BQ / VO detail pages (landscape) ── */
    .ipa-page-landscape { page: landscape; }
    .detail-header { margin-bottom: 10px; font-size: 10px; }
    table.bq-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.bq-table th, table.bq-table td { padding: 3px 5px; }
    .bd { border: 1px solid #1f2937; }
    .bx { border-left: 1px solid #1f2937; border-right: 1px solid #1f2937; }
    .section-title { font-weight: 700; text-decoration: underline; }
    /* Column widths — percentages of A4 landscape usable width (~277mm) */
    .w-item { width: 5%; }   /* ~14mm  Item no */
    .w-desc { }              /* flex   Description — takes remaining space */
    .w-qty  { width: 9%; }   /* ~25mm  Qty / Previous / Current / Accumulated */
    .w-unit { width: 4%; }   /* ~11mm  Unit */
    .w-rate { width: 9%; }   /* ~25mm  Rate */
    .w-amt  { width: 12%; }  /* ~33mm  Amount / Amount(HK$) */

    .page-break { page-break-before: always; break-before: page; }
    .ipa-page { padding: 0 2mm; }
    table.bq-table tr { page-break-inside: avoid; }
    table.bq-table thead { display: table-header-group; }
  </style>
</head>
<body>
  <!-- ═══════════ PAGE 1 : PAYMENT SUMMARY ═══════════ -->
  <section class="ipa-page">
    <div class="header-block">
      <p class="title">${this.escapeHtml(projectTitle)}</p>
      ${
        subcontractWorks && subcontractWorks !== projectTitle
          ? `<p class="title" style="margin-top:8px;">${this.escapeHtml(subcontractWorks)}</p>`
          : ''
      }
      <p class="pa-line">${this.escapeHtml(paLine)}</p>
    </div>

    <div class="meta-wrap">
      <table class="meta-table">
        <tbody>
          <tr>
            <td class="label">Main-Contractor :</td>
            <td class="blue">${this.escapeHtml(ipa.contract?.client?.name || '-')}</td>
          </tr>
          <tr>
            <td class="label">Subcontractor Name :</td>
            <td class="blue">${this.escapeHtml(companyName || '-')}</td>
          </tr>
          <tr>
            <td class="label">Subcontract Works :</td>
            <td class="blue" style="max-width:380px;">${this.escapeHtml(subcontractWorks)}</td>
          </tr>
        </tbody>
      </table>
      <table class="meta-table" style="align-self:flex-start;">
        <tbody>
          <tr>
            <td class="label">Payment No. :</td>
            <td class="blue value-right">${this.escapeHtml(String(ipa.pa_no))}</td>
          </tr>
          <tr>
            <td class="label">Payment Type :</td>
            <td class="blue value-right">Interim</td>
          </tr>
          <tr>
            <td class="label">As at Date :</td>
            <td class="blue value-right">${this.fmtAsAt(ipa.period_to)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="subcontract-sum">
      <span class="label">Subcontract Sum :</span>
      <span class="blue">${this.fmtNum(calc.contractSum)}</span>
    </div>

    <table class="summary-table">
      <thead>
        <tr>
          <th style="width:40px;"></th>
          <th></th>
          <th style="width:144px;">Payment<br />Application</th>
          <th style="width:144px;">Previously<br />Certified</th>
          <th style="width:160px;">Outstanding Amount</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRowsHtml}
        <tr>
          <td></td>
          <td></td>
          <td></td>
          <td class="amount-due-label">AMOUNT DUE :</td>
          <td class="amount-due-value mono">${this.fmtNum(calc.amountDue)}</td>
        </tr>
      </tbody>
    </table>
  </section>

  ${bqSectionHtml}
  ${voSectionHtml}
</body>
</html>`;
  }

  // ═══════════════════════════════════════════════════════════
  // Formatting helpers（與前端 print page 一致）
  // ═══════════════════════════════════════════════════════════

  private fmtNum(v: any): string {
    const n = Number(v || 0);
    if (Math.abs(n) < 0.005) return '-';
    const abs = Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return n < 0 ? `(${abs})` : abs;
  }

  private fmtQty(v: any): string {
    const n = Number(v || 0);
    if (Math.abs(n) < 0.00005) return '-';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private fmtAsAt(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('day')}-${get('month')}-${get('year')}`;
  }

  private fmtDate(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '-';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')}`;
  }

  private pct(rate: number): string {
    const p = Number(rate || 0) * 100;
    return p % 1 === 0 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`;
  }

  private escapeHtml(value: any) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
