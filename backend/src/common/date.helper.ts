/**
 * 共用的 Asia/Hong_Kong 時區處理工具（純函式 export，不需註冊為 NestJS provider）。
 *
 * 本模組抽取各 Service 中重複的香港時區處理代碼。每個函式都對應原本
 * 散落在各 Service 的特定寫法，行為與原碼逐字一致，僅作去重，不改變任何輸出。
 */

const HK_TIME_ZONE = 'Asia/Hong_Kong';

/**
 * 將 Date 轉為香港時區的「sv」locale 日期時間字串，並把空白換成 'T'
 * （形如 `2026-06-24T13:45:00`）。
 *
 * 等同原 verification/whatsapp.service.ts 多處的：
 *   `date.toLocaleString('sv', { timeZone: 'Asia/Hong_Kong' }).replace(' ', 'T')`
 */
export function toHKDateTimeString(date: Date): string {
  return date
    .toLocaleString('sv', { timeZone: HK_TIME_ZONE })
    .replace(' ', 'T');
}

/**
 * 將 Date 轉為香港時區的 `YYYY-MM-DD` 字串（en-CA locale）。
 *
 * 等同原多處的：
 *   `date.toLocaleDateString('en-CA', { timeZone: 'Asia/Hong_Kong' })`
 */
export function toHKDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: HK_TIME_ZONE });
}

/**
 * 取得指定時間（預設現在）在香港時區的小時數（0-23, 24 小時制）。
 *
 * 等同原 attendances/attendance-matching.service.ts 多處的：
 *   `Number(new Date(ts).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Hong_Kong' }))`
 */
export function getHKHour(date: Date = new Date()): number {
  return Number(
    date.toLocaleString('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: HK_TIME_ZONE,
    }),
  );
}

/**
 * 將 Date 以 Asia/Hong_Kong 時區格式化為 YYYY-MM-DD，
 * 避免 toISOString() 使用 UTC 導致日期偏移。輸入無效時回傳 null。
 *
 * 等同原 attendances/attendance-matching.service.ts 的 `formatDateInHongKong`。
 */
export function formatDateInHongKong(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * 將 Date 以 Asia/Hong_Kong 時區格式化為 `YYYY-MM-DD`（en-CA），
 * 可選擇包含時間（`YYYY-MM-DD HH:mm`）。空值回傳空字串。
 *
 * 等同原 work-logs/work-logs.service.ts 的 `formatHongKongDate`。
 */
export function formatHongKongDate(
  value: Date | null | undefined,
  includeTime = false,
): string {
  if (!value) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: HK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : {}),
  });
  return formatter.format(value).replace(', ', ' ');
}

/**
 * 取得香港當日（00:00 - 次日 00:00）的 UTC 邊界，採用手動 UTC+8 offset 計算。
 * 可傳入特定時間（預設現在）。
 *
 * 等同原 dashboard / employee-portal / company-clock 的 `getHKTDayRange`。
 */
export function getHKTDayRange(date?: Date): { start: Date; end: Date } {
  const now = date || new Date();
  const hktOffset = 8 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const hktMs = utcMs + hktOffset * 60000;
  const hktNow = new Date(hktMs);
  const hktDayStart = new Date(
    hktNow.getFullYear(),
    hktNow.getMonth(),
    hktNow.getDate(),
  );
  const start = new Date(hktDayStart.getTime() - hktOffset * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * 取得香港當月第一天的 UTC 起點，採用手動 UTC+8 offset 計算。
 *
 * 等同原 employee-portal/employee-portal.service.ts 的 `getHKTMonthStart`。
 */
export function getHKTMonthStart(): Date {
  const now = new Date();
  const hktOffset = 8 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const hktMs = utcMs + hktOffset * 60000;
  const hktNow = new Date(hktMs);
  const hktMonthStart = new Date(hktNow.getFullYear(), hktNow.getMonth(), 1);
  return new Date(hktMonthStart.getTime() - hktOffset * 60000);
}

/**
 * 將 Date 轉為「香港本地時間」的 Date 物件（其 getHours()/getMinutes() 等
 * 會回傳香港本地值），採用手動 UTC+8 offset 計算。
 *
 * 等同原 dashboard/dashboard.service.ts 的 `toHKTDate`。
 */
export function toHKTDate(d: Date): Date {
  const hktOffset = 8 * 60;
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  return new Date(utcMs + hktOffset * 60000);
}
