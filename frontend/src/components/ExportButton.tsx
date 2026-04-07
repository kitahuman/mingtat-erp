'use client';
import { useState, useRef, useEffect } from 'react';

interface ExportColumn {
  key: string;
  label: string;
  render?: (value: any, row: any) => any;
  exportRender?: (value: any, row: any) => string;
  filterRender?: (value: any, row: any) => string;
}

interface ExportButtonProps {
  columns: ExportColumn[];
  data: any[];
  filename?: string;
  onFetchAll?: () => Promise<any[]>;
}

// Format ISO date string to DD/MM/YYYY
function formatExportDate(val: any): string | null {
  if (!val) return null;
  const s = String(val);
  // Match ISO datetime: 2027-10-22T00:00:00.000Z or YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return null;
}

function getExportValue(col: ExportColumn, row: any): string {
  const raw = row[col.key];
  // Use exportRender if provided, then filterRender, then raw value
  if (col.exportRender) {
    return String(col.exportRender(raw, row) ?? '');
  }
  if (col.filterRender) {
    return String(col.filterRender(raw, row) ?? '');
  }
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'object') return JSON.stringify(raw);
  // Auto-format ISO date strings
  const formatted = formatExportDate(raw);
  if (formatted) return formatted;
  return String(raw);
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function generateCsv(columns: ExportColumn[], data: any[]): string {
  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  const header = columns.map(c => escapeCsvField(c.label)).join(',');
  const rows = data.map(row =>
    columns.map(col => escapeCsvField(getExportValue(col, row))).join(',')
  );
  return bom + header + '\n' + rows.join('\n');
}

function generateExcelXml(columns: ExportColumn[], data: any[]): string {
  // Generate a simple Excel XML Spreadsheet format
  const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
  xml += '<Styles>\n';
  xml += '<Style ss:ID="header"><Font ss:Bold="1"/><Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/></Style>\n';
  xml += '</Styles>\n';
  xml += '<Worksheet ss:Name="Sheet1">\n';
  xml += '<Table>\n';

  // Header row
  xml += '<Row>\n';
  for (const col of columns) {
    xml += `<Cell ss:StyleID="header"><Data ss:Type="String">${escapeXml(col.label)}</Data></Cell>\n`;
  }
  xml += '</Row>\n';

  // Data rows
  for (const row of data) {
    xml += '<Row>\n';
    for (const col of columns) {
      const val = getExportValue(col, row);
      const isNum = val !== '' && !isNaN(Number(val)) && val.trim() !== '';
      xml += `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(val)}</Data></Cell>\n`;
    }
    xml += '</Row>\n';
  }

  xml += '</Table>\n';
  xml += '</Worksheet>\n';
  xml += '</Workbook>';
  return xml;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportButton({ columns, data, filename = 'export', onFetchAll }: ExportButtonProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const getExportData = async (): Promise<any[]> => {
    if (onFetchAll) {
      setExporting(true);
      try {
        return await onFetchAll();
      } finally {
        setExporting(false);
      }
    }
    return data;
  };

  const handleExportCsv = async () => {
    const exportData = await getExportData();
    const csv = generateCsv(columns, exportData);
    downloadFile(csv, `${filename}.csv`, 'text/csv;charset=utf-8');
    setShowMenu(false);
  };

  const handleExportExcel = async () => {
    const exportData = await getExportData();
    const xml = generateExcelXml(columns, exportData);
    downloadFile(xml, `${filename}.xls`, 'application/vnd.ms-excel');
    setShowMenu(false);
  };

  if (!data || data.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-gray-700"
        title="匯出資料"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {exporting ? '匯出中...' : '匯出'}
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[140px]">
          <button
            onClick={handleExportCsv}
            className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
          >
            <span className="text-green-600 font-mono text-xs font-bold">CSV</span>
            匯出 CSV
          </button>
          <button
            onClick={handleExportExcel}
            className="w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100 rounded-b-lg"
          >
            <span className="text-blue-600 font-mono text-xs font-bold">XLS</span>
            匯出 Excel
          </button>
        </div>
      )}
    </div>
  );
}
