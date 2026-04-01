/**
 * 全局日期格式化工具函數
 * 統一將日期顯示為 DD/MM/YYYY 格式
 */

/**
 * 格式化日期為 DD/MM/YYYY
 * 支援 ISO 字串、Date 物件、YYYY-MM-DD 字串
 * @param value 日期值（ISO 字串、Date 物件、YYYY-MM-DD 字串）
 * @returns 格式化後的 DD/MM/YYYY 字串，無效日期返回 '-'
 */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  try {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string') {
      // Handle YYYY-MM-DD (no timezone conversion needed)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        return `${d}/${m}/${y}`;
      }
      // Handle ISO string (e.g. 2027-10-22T00:00:00.000Z)
      date = new Date(value);
    } else {
      return '-';
    }
    if (isNaN(date.getTime())) return '-';
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
  } catch {
    return '-';
  }
}

/**
 * 格式化日期為 input[type=date] 所需的 YYYY-MM-DD 格式（用於編輯模式）
 */
export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch {
    return '';
  }
}
