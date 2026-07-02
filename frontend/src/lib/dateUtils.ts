/**
 * 全局日期格式化工具函數
 * 統一將日期顯示為 DD/MM/YYYY 格式
 * 所有 ISO datetime 字串使用 Asia/Hong_Kong 時區轉換
 */

const HK_TIME_ZONE = 'Asia/Hong_Kong';

/**
 * 將 Date 物件以香港時區取得 day/month/year
 */
function getHKDateParts(date: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const result: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = part.value;
  }
  return { day: result.day, month: result.month, year: result.year };
}

/**
 * 格式化日期為 DD/MM/YYYY
 * 支援 ISO 字串、Date 物件、YYYY-MM-DD 字串
 * ISO datetime 字串使用 Asia/Hong_Kong 時區轉換日期
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
      // Handle YYYY-MM-DD (pure date, no timezone conversion needed)
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        return `${d}/${m}/${y}`;
      }
      // Handle ISO string (e.g. 2026-07-01T23:48:00.000Z)
      date = new Date(value);
    } else {
      return '-';
    }
    if (isNaN(date.getTime())) return '-';
    const { day, month, year } = getHKDateParts(date);
    return `${day}/${month}/${year}`;
  } catch {
    return '-';
  }
}

/**
 * 格式化日期為 input[type=date] 所需的 YYYY-MM-DD 格式（用於編輯模式）
 * ISO datetime 字串使用 Asia/Hong_Kong 時區轉換日期
 */
export function toInputDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    const { day, month, year } = getHKDateParts(date);
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}
