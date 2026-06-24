/**
 * 共用的數值處理工具（純函式 export，不需註冊為 NestJS provider）。
 *
 * 各 Service 原本自行定義的四捨五入私有函式存在「兩種不同實作」，
 * 為確保純重構不改變任何行為，本模組同時提供兩種對應實作，
 * 各 Service 改為呼叫原本對應的那一個：
 *
 * 1. roundMoney(value, decimals = 2)
 *    使用 parseFloat(value.toFixed(decimals))，對應原本以下 Service 的 round2：
 *    company-profit-loss、dashboard、equipment-profit、
 *    fixed-expense-report、project-profit-loss。
 *
 * 2. roundMoneyHalfUp(value)
 *    使用 Math.round(value * 100) / 100（固定 2 位小數），對應原本以下實作：
 *    daily-report-stats 的 round2、expenses 的 roundMoney。
 */

/**
 * 以 toFixed 方式四捨五入（預設 2 位小數）。
 * 等同原各 Service 的 `parseFloat(n.toFixed(2))`。
 */
export function roundMoney(value: number, decimals = 2): number {
  return parseFloat(value.toFixed(decimals));
}

/**
 * 以 Math.round 方式四捨五入到 2 位小數。
 * 等同原 daily-report-stats / expenses 的 `Math.round(value * 100) / 100`。
 */
export function roundMoneyHalfUp(value: number): number {
  return Math.round(value * 100) / 100;
}
