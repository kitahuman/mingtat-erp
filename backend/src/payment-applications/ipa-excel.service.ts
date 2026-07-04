import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { IpaPdfService } from './ipa-pdf.service';

/**
 * IPA Excel 產生服務。
 * 產出兩個工作表（含公式，非硬編碼數值）：
 *   1. "IPA No. X (C)" — Payment Summary（付款申請匯總）
 *   2. "IPA No. X"     — BQ Detail（Applied Workdone 明細）
 */
@Injectable()
export class IpaExcelService {
  constructor(private readonly ipaPdfService: IpaPdfService) {}

  private readonly numFmt = '#,##0.00;(#,##0.00);"-"';
  private readonly qtyFmt = '#,##0.00;(#,##0.00);"-"';

  private readonly thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
  private readonly sideBorder: Partial<ExcelJS.Borders> = {
    left: { style: 'thin' },
    right: { style: 'thin' },
  };

  async generateIpaExcel(contractId: number, paId: number) {
    const { ipa, ipaList, companyName } = await this.ipaPdfService.fetchIpaData(
      contractId,
      paId,
    );
    const calc = this.ipaPdfService.buildCalculations(ipa, ipaList);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MingTat ERP';
    workbook.created = new Date();

    const detailSheetName = `IPA No. ${ipa.pa_no}`;
    const summarySheetName = `IPA No. ${ipa.pa_no} (C)`;

    // Detail sheet must be built first so we know the total row for cross-sheet
    // references, but we want the summary sheet to appear first in the workbook.
    const summarySheet = workbook.addWorksheet(summarySheetName);
    const detailSheet = workbook.addWorksheet(detailSheetName);

    const detailRefs = this.buildDetailSheet(detailSheet, ipa, calc);
    this.buildSummarySheet(
      summarySheet,
      ipa,
      calc,
      companyName,
      detailSheetName,
      detailRefs,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), ipa };
  }

  // ═══════════════════════════════════════════════════════════
  // Sheet 2: "IPA No. X" — BQ Detail with formulas
  // ═══════════════════════════════════════════════════════════

  private buildDetailSheet(ws: ExcelJS.Worksheet, ipa: any, calc: any) {
    // Columns:
    // A Item | B Description | C Qty | D Unit | E Rate | F Amount
    // G Previous | H Current | I Accumulated | J Amount (HK$)
    ws.columns = [
      { key: 'item', width: 10 },
      { key: 'desc', width: 48 },
      { key: 'qty', width: 12 },
      { key: 'unit', width: 8 },
      { key: 'rate', width: 12 },
      { key: 'amount', width: 16 },
      { key: 'prev', width: 12 },
      { key: 'curr', width: 12 },
      { key: 'acc', width: 14 },
      { key: 'amt_hkd', width: 16 },
    ];

    const projectTitle =
      ipa.contract?.description || ipa.contract?.contract_name || '';
    const subcontractWorks = ipa.contract?.contract_name || '';
    const paLine = `Payment Application No.${ipa.pa_no} (up to ${this.fmtDateStr(ipa.period_to)})`;

    // Header block
    let rowIdx = 1;
    const titleRow = ws.getRow(rowIdx++);
    titleRow.getCell(1).value = projectTitle;
    titleRow.getCell(1).font = { bold: true, underline: true };
    if (subcontractWorks && subcontractWorks !== projectTitle) {
      const worksRow = ws.getRow(rowIdx++);
      worksRow.getCell(1).value = subcontractWorks;
      worksRow.getCell(1).font = { bold: true, underline: true };
    }
    const paRow = ws.getRow(rowIdx++);
    paRow.getCell(1).value = paLine;
    paRow.getCell(1).font = { bold: true, underline: true };
    rowIdx++; // blank row

    // Table header (two rows: group header + column header)
    const groupHeaderRow = ws.getRow(rowIdx++);
    groupHeaderRow.getCell(7).value = 'Applied Workdone';
    ws.mergeCells(groupHeaderRow.number, 7, groupHeaderRow.number, 10);
    groupHeaderRow.getCell(7).alignment = { horizontal: 'center' };
    groupHeaderRow.getCell(7).font = { bold: true };
    for (let c = 1; c <= 10; c++) {
      groupHeaderRow.getCell(c).border = this.thinBorder;
    }

    const headerRow = ws.getRow(rowIdx++);
    const headers = [
      'Item',
      'Description',
      'Qty',
      'Unit',
      'Rate',
      'Amount',
      'Previous',
      'Current',
      'Accumulated',
      'Amount (HK$)',
    ];
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = this.thinBorder;
    });

    // BQ items grouped by section
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

    const dataStartRow = rowIdx;
    const itemRowNumbers: number[] = [];

    Object.values(bqGrouped).forEach((group) => {
      // Section header row
      const sectionRow = ws.getRow(rowIdx++);
      sectionRow.getCell(2).value = [
        group.section.section_code,
        group.section.section_name,
      ]
        .filter(Boolean)
        .join(' ');
      sectionRow.getCell(2).font = { bold: true, underline: true };
      for (let c = 1; c <= 10; c++) {
        sectionRow.getCell(c).border = this.sideBorder;
      }

      group.items.forEach((item: any) => {
        const r = rowIdx++;
        itemRowNumbers.push(r);
        const row = ws.getRow(r);
        row.getCell(1).value = item.bq_item?.item_no || '';
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' };
        row.getCell(2).value = item.bq_item?.description || '';
        row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        row.getCell(3).value = Number(item.bq_item?.quantity || 0);
        row.getCell(3).numFmt = this.qtyFmt;
        row.getCell(4).value = item.bq_item?.unit || '';
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'top' };
        row.getCell(5).value = Number(item.unit_rate || 0);
        row.getCell(5).numFmt = this.numFmt;
        // Amount = Qty × Rate (formula)
        row.getCell(6).value = { formula: `C${r}*E${r}` };
        row.getCell(6).numFmt = this.numFmt;
        row.getCell(7).value = Number(item.prev_cumulative_qty || 0);
        row.getCell(7).numFmt = this.qtyFmt;
        row.getCell(8).value = Number(item.this_period_qty || 0);
        row.getCell(8).numFmt = this.qtyFmt;
        // Accumulated = Previous + Current (formula)
        row.getCell(9).value = { formula: `G${r}+H${r}` };
        row.getCell(9).numFmt = this.qtyFmt;
        // Amount (HK$) = Accumulated × Rate (formula)
        row.getCell(10).value = { formula: `I${r}*E${r}` };
        row.getCell(10).numFmt = this.numFmt;
        for (let c = 1; c <= 10; c++) {
          row.getCell(c).border = this.sideBorder;
        }
      });
    });

    // Total row: SUM formulas
    const dataEndRow = rowIdx - 1;
    const totalRowNum = rowIdx++;
    const totalRow = ws.getRow(totalRowNum);
    if (dataEndRow >= dataStartRow) {
      totalRow.getCell(6).value = {
        formula: `SUM(F${dataStartRow}:F${dataEndRow})`,
      };
      totalRow.getCell(10).value = {
        formula: `SUM(J${dataStartRow}:J${dataEndRow})`,
      };
    } else {
      totalRow.getCell(6).value = 0;
      totalRow.getCell(10).value = 0;
    }
    totalRow.getCell(6).numFmt = this.numFmt;
    totalRow.getCell(10).numFmt = this.numFmt;
    totalRow.font = { bold: true };
    for (let c = 1; c <= 10; c++) {
      totalRow.getCell(c).border = this.thinBorder;
    }

    return { totalRowNum };
  }

  // ═══════════════════════════════════════════════════════════
  // Sheet 1: "IPA No. X (C)" — Payment Summary with formulas
  // ═══════════════════════════════════════════════════════════

  private buildSummarySheet(
    ws: ExcelJS.Worksheet,
    ipa: any,
    calc: any,
    companyName: string,
    detailSheetName: string,
    detailRefs: { totalRowNum: number },
  ) {
    // Layout columns:
    // A No | B..D Label | E value col (Subcontract Sum) |
    // H Payment Application | J Previously Certified | L Outstanding Amount
    ws.columns = [
      { width: 7 }, // A
      { width: 30 }, // B
      { width: 14 }, // C
      { width: 14 }, // D
      { width: 16 }, // E
      { width: 4 }, // F
      { width: 4 }, // G
      { width: 16 }, // H
      { width: 4 }, // I
      { width: 16 }, // J
      { width: 4 }, // K
      { width: 18 }, // L
    ];

    const projectTitle =
      ipa.contract?.description || ipa.contract?.contract_name || '';
    const subcontractWorks = ipa.contract?.contract_name || '';
    const paLine = `Payment Application No.${ipa.pa_no} (up to ${this.fmtDateStr(ipa.period_to)})`;

    const blueFont: Partial<ExcelJS.Font> = {
      color: { argb: 'FF1E40AF' },
    };

    // ── Header block (rows 1-4) ──
    ws.getCell('A1').value = projectTitle;
    ws.getCell('A1').font = { bold: true };
    ws.getCell('A2').value =
      subcontractWorks && subcontractWorks !== projectTitle
        ? subcontractWorks
        : '';
    ws.getCell('A2').font = { bold: true };
    ws.getCell('A3').value = paLine;
    ws.getCell('A3').font = { bold: true, underline: true };

    // ── Meta info (rows 5-8) ──
    ws.getCell('A5').value = 'Main-Contractor :';
    ws.getCell('C5').value = ipa.contract?.client?.name || '-';
    ws.getCell('C5').font = blueFont;
    ws.getCell('H5').value = 'Payment No. :';
    ws.getCell('J5').value = Number(ipa.pa_no);
    ws.getCell('J5').font = blueFont;

    ws.getCell('A6').value = 'Subcontractor Name :';
    ws.getCell('C6').value = companyName || '-';
    ws.getCell('C6').font = blueFont;
    ws.getCell('H6').value = 'Payment Type :';
    ws.getCell('J6').value = 'Interim';
    ws.getCell('J6').font = blueFont;

    ws.getCell('A7').value = 'Subcontract Works :';
    ws.getCell('C7').value = subcontractWorks;
    ws.getCell('C7').font = blueFont;
    ws.getCell('H7').value = 'As at Date :';
    ws.getCell('J7').value = this.fmtAsAt(ipa.period_to);
    ws.getCell('J7').font = blueFont;

    // ── Subcontract Sum (row 11 to match reference formulas E11) ──
    ws.getCell('A11').value = 'Subcontract Sum :';
    ws.getCell('A11').font = { bold: true };
    ws.getCell('E11').value = Number(calc.contractSum || 0);
    ws.getCell('E11').numFmt = this.numFmt;
    ws.getCell('E11').font = { bold: true, ...blueFont };

    // ── Column headers (row 13) ──
    const colHeaderRow = 13;
    ws.getCell(`H${colHeaderRow}`).value = 'Payment Application';
    ws.getCell(`J${colHeaderRow}`).value = 'Previously Certified';
    ws.getCell(`L${colHeaderRow}`).value = 'Outstanding Amount';
    ['H', 'J', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${colHeaderRow}`);
      cell.font = { bold: true, underline: true };
      cell.alignment = { horizontal: 'center', wrapText: true };
    });

    const pctText = this.pct(calc.advancePaymentRate);
    const detailTotalRef = `'${detailSheetName}'!J${detailRefs.totalRowNum}`;

    // Helper to write a data row: label + H (app) + J (prev) + L (outstanding formula)
    const setRow = (
      r: number,
      no: string,
      label: string,
      appValue: number | { formula: string } | null,
      prevValue: number | null,
      opts: { bold?: boolean; topBorder?: boolean } = {},
    ) => {
      ws.getCell(`A${r}`).value = no;
      ws.getCell(`B${r}`).value = label;
      if (opts.bold) {
        ws.getCell(`A${r}`).font = { bold: true };
        ws.getCell(`B${r}`).font = { bold: true };
      }
      const hCell = ws.getCell(`H${r}`);
      const jCell = ws.getCell(`J${r}`);
      const lCell = ws.getCell(`L${r}`);
      if (appValue !== null) {
        hCell.value = appValue as any;
        hCell.numFmt = this.numFmt;
      } else {
        hCell.value = '-';
        hCell.alignment = { horizontal: 'right' };
      }
      if (prevValue !== null) {
        jCell.value = prevValue;
        jCell.numFmt = this.numFmt;
      } else {
        jCell.value = '-';
        jCell.alignment = { horizontal: 'right' };
      }
      if (appValue !== null || prevValue !== null) {
        // Outstanding = Payment Application - Previously Certified
        lCell.value = {
          formula: `IF(AND(ISNUMBER(H${r}),ISNUMBER(J${r})),H${r}-J${r},IF(ISNUMBER(H${r}),H${r},IF(ISNUMBER(J${r}),-J${r},"-")))`,
        };
        lCell.numFmt = this.numFmt;
      } else {
        lCell.value = '-';
        lCell.alignment = { horizontal: 'right' };
      }
      if (opts.bold) {
        hCell.font = { bold: true };
        jCell.font = { bold: true };
        lCell.font = { bold: true };
      }
      if (opts.topBorder) {
        ['H', 'J', 'L'].forEach((col) => {
          ws.getCell(`${col}${r}`).border = {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
          };
        });
      }
    };

    // ── Section 1: Workdone (rows 15-21, matching reference layout) ──
    // 1.1 VALUE OF MEASURED WORKDONE — formula referencing detail sheet total
    setRow(
      15,
      '1.1)',
      'VALUE OF MEASURED WORKDONE',
      { formula: detailTotalRef },
      calc.prevBqWorkDone,
    );
    setRow(16, '1.2)', 'VALUE OF VARIATION', calc.voWorkDone, calc.prevVoWorkDone);
    setRow(17, '1.3)', 'Daily', null, null);
    // rows 18-20 reserved (blank) so TOTAL = SUM(H15:H20)
    const totalRowR = 21;
    ws.getCell(`B${totalRowR}`).value =
      'TOTAL VALUE OF WORKDONE  (1.1 to 1.3):';
    ws.getCell(`B${totalRowR}`).font = { bold: true };
    ws.getCell(`H${totalRowR}`).value = { formula: 'SUM(H15:H20)' };
    ws.getCell(`J${totalRowR}`).value = { formula: 'SUM(J15:J20)' };
    ws.getCell(`L${totalRowR}`).value = { formula: `H${totalRowR}-J${totalRowR}` };
    ['H', 'J', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${totalRowR}`);
      cell.numFmt = this.numFmt;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    });

    // ── Section 2: Advance payment (rows 23-27) ──
    const hasAdvance = !!calc.hasAdvance;
    ws.getCell('A23').value = '2.1)';
    ws.getCell('B23').value = `Advance payment (${pctText} of Contract Sum)`;
    if (hasAdvance) {
      // Advance = Subcontract Sum × rate (formula, e.g. =E11*0.1)
      ws.getCell('H23').value = {
        formula: `E11*${Number(calc.advancePaymentRate)}`,
      };
      ws.getCell('H23').numFmt = this.numFmt;
      ws.getCell('J23').value = Number(calc.prevAdvancePayment || 0);
      ws.getCell('J23').numFmt = this.numFmt;
    } else {
      ws.getCell('H23').value = '-';
      ws.getCell('H23').alignment = { horizontal: 'right' };
      ws.getCell('J23').value = '-';
      ws.getCell('J23').alignment = { horizontal: 'right' };
    }

    ws.getCell('A24').value = '2.2)';
    ws.getCell('B24').value = `Release of Advance payment (${pctText} of Workdone)`;
    if (hasAdvance) {
      // Release amount is capped by the advance principal, so use the computed
      // value here rather than a naive -H15*rate formula (which ignores the cap).
      ws.getCell('H24').value = Number(calc.appRelease || 0);
      ws.getCell('H24').numFmt = this.numFmt;
      ws.getCell('J24').value = Number(calc.prevRelease || 0);
      ws.getCell('J24').numFmt = this.numFmt;
    } else {
      ws.getCell('H24').value = '-';
      ws.getCell('H24').alignment = { horizontal: 'right' };
      ws.getCell('J24').value = '-';
      ws.getCell('J24').alignment = { horizontal: 'right' };
    }

    const sub2R = 27;
    ws.getCell(`B${sub2R}`).value = 'SUBTOTAL  (2.1 to 2.2):';
    ws.getCell(`B${sub2R}`).font = { bold: true };
    if (hasAdvance) {
      ws.getCell(`H${sub2R}`).value = { formula: 'SUM(H23:H26)' };
      ws.getCell(`J${sub2R}`).value = { formula: 'SUM(J23:J26)' };
      ws.getCell(`L${sub2R}`).value = { formula: `H${sub2R}-J${sub2R}` };
    } else {
      ws.getCell(`H${sub2R}`).value = 0;
      ws.getCell(`J${sub2R}`).value = 0;
      ws.getCell(`L${sub2R}`).value = 0;
    }
    ['H', 'J', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${sub2R}`);
      cell.numFmt = this.numFmt;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    });

    // ── Section 3: Retention (rows 29-33) ──
    const retentionRate = Number(ipa.contract?.retention_rate || 0);
    ws.getCell('A29').value = '3.1)';
    ws.getCell('B29').value = 'Retention';
    if (calc.retention > 0) {
      // Retention = -(total workdone × retention rate); may be capped, so use
      // formula only when uncapped value matches, otherwise hard value.
      const uncapped = calc.totalWorkDone * retentionRate;
      if (retentionRate > 0 && Math.abs(uncapped - calc.retention) < 0.01) {
        ws.getCell('H29').value = { formula: `-H${totalRowR}*${retentionRate}` };
      } else {
        ws.getCell('H29').value = -Number(calc.retention);
      }
      ws.getCell('H29').numFmt = this.numFmt;
    } else {
      ws.getCell('H29').value = '-';
      ws.getCell('H29').alignment = { horizontal: 'right' };
    }
    if (calc.prevRetention > 0) {
      ws.getCell('J29').value = -Number(calc.prevRetention);
      ws.getCell('J29').numFmt = this.numFmt;
    } else {
      ws.getCell('J29').value = '-';
      ws.getCell('J29').alignment = { horizontal: 'right' };
    }

    ws.getCell('A30').value = '3.2)';
    ws.getCell('B30').value = 'LESS RETENTION';
    ws.getCell('H30').value = '-';
    ws.getCell('H30').alignment = { horizontal: 'right' };
    ws.getCell('J30').value = '-';
    ws.getCell('J30').alignment = { horizontal: 'right' };

    const sub3R = 33;
    ws.getCell(`B${sub3R}`).value = 'SUBTOTAL  (3.1 to 3.2):';
    ws.getCell(`B${sub3R}`).font = { bold: true };
    ws.getCell(`H${sub3R}`).value = { formula: 'SUM(H29:H32)' };
    ws.getCell(`J${sub3R}`).value = { formula: 'SUM(J29:J32)' };
    ws.getCell(`L${sub3R}`).value = { formula: `H${sub3R}-J${sub3R}` };
    ['H', 'J', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${sub3R}`);
      cell.numFmt = this.numFmt;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    });

    // ── Section 4: Contra charges (rows 35-37) ──
    ws.getCell('A35').value = '4)';
    ws.getCell('B35').value = 'Less Contra Charges';
    if (calc.contraCharges > 0) {
      ws.getCell('H35').value = -Number(calc.contraCharges);
      ws.getCell('H35').numFmt = this.numFmt;
    } else {
      ws.getCell('H35').value = '-';
      ws.getCell('H35').alignment = { horizontal: 'right' };
    }
    if (calc.prevContraCharges > 0) {
      ws.getCell('J35').value = -Number(calc.prevContraCharges);
      ws.getCell('J35').numFmt = this.numFmt;
    } else {
      ws.getCell('J35').value = '-';
      ws.getCell('J35').alignment = { horizontal: 'right' };
    }

    const sub4R = 37;
    ws.getCell(`B${sub4R}`).value = 'SUBTOTAL  (4):';
    ws.getCell(`B${sub4R}`).font = { bold: true };
    ws.getCell(`H${sub4R}`).value = { formula: 'SUM(H35:H36)' };
    ws.getCell(`J${sub4R}`).value = { formula: 'SUM(J35:J36)' };
    ws.getCell(`L${sub4R}`).value = { formula: `H${sub4R}-J${sub4R}` };
    ['H', 'J', 'L'].forEach((col) => {
      const cell = ws.getCell(`${col}${sub4R}`);
      cell.numFmt = this.numFmt;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    });

    // ── AMOUNT DUE (row 40) = sum of section subtotal outstanding amounts ──
    const amountDueR = 40;
    ws.getCell(`J${amountDueR}`).value = 'AMOUNT DUE :';
    ws.getCell(`J${amountDueR}`).font = { bold: true };
    ws.getCell(`J${amountDueR}`).alignment = { horizontal: 'right' };
    ws.getCell(`L${amountDueR}`).value = {
      formula: `L${totalRowR}+L${sub2R}+L${sub3R}+L${sub4R}`,
    };
    ws.getCell(`L${amountDueR}`).numFmt = this.numFmt;
    ws.getCell(`L${amountDueR}`).font = { bold: true };
    ws.getCell(`L${amountDueR}`).border = {
      top: { style: 'thin' },
      bottom: { style: 'double' },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Formatting helpers
  // ═══════════════════════════════════════════════════════════

  private fmtDateStr(value: any): string {
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

  private pct(rate: number): string {
    const p = Number(rate || 0) * 100;
    return p % 1 === 0 ? `${p.toFixed(0)}%` : `${p.toFixed(1)}%`;
  }
}
