# 公司損益表（P&L）功能檢視報告

經過對現有公司損益表功能的全面檢視，我們發現了幾個關鍵問題，特別是在新加入的糧單和付款記錄功能的整合上，以及一些計算邏輯上的漏洞。以下是詳細的分析與建議。

## 1. 發現的問題

### 1.1 糧單與支出記錄的重複計算問題
目前系統的設計是：當糧單確認後，會自動生成對應的 `Expense`（支出）記錄。但在損益表的計算中，並沒有過濾掉這些由糧單自動生成的支出。如果未來直接把糧單金額也加進去，就會造成**重複計算**（Double Counting）。
此外，現有損益表的 `calcCosts` 方法在查詢 `Expense` 時，並沒有過濾掉 `deleted_at` 不為 null 的記錄（軟刪除的記錄）。這會導致已刪除的支出（例如重新生成糧單時刪除的舊支出）仍被計算在內。

### 1.2 付款記錄（PaymentOut）的關聯錯誤
在 `CompanyProfitLossService` 中計算應付帳款（Accounts Payable）時，程式碼嘗試透過 `project` 關聯來過濾 `PaymentOut`：
```typescript
const paymentOutWhere: any = {};
if (companyId) {
  paymentOutWhere.project = { company_id: companyId }; // 錯誤：PaymentOut 模型沒有 project 關聯
}
```
然而，檢視 Prisma Schema 發現，`PaymentOut` 模型並沒有 `project` 關聯，而是直接有關聯到 `company`、`expense` 和 `payroll`。這會導致在按公司篩選時發生資料庫查詢錯誤或崩潰。

### 1.3 收入項目的完整性
目前的收入計算包含：
1. 工程收入（Project Revenue）：基於 `PaymentApplication` 的認證金額。
2. 發票收入（Invoice Revenue）：基於 `Invoice` 的總金額。
3. 其他收入（Other Income）：基於 `PaymentIn` 且 `source_type = 'other'`。

這裡的問題是，發票（Invoice）的查詢沒有過濾掉 `deleted_at` 不為 null 的軟刪除記錄。

### 1.4 會計年度（Financial Year）篩選缺失
目前前端只有「月度」、「季度」和「年度（自然年）」的篩選。公司的會計年度是從 4 月開始（4 月至翌年 3 月），現有系統無法提供這種對齊方式的損益報表。

## 2. 修改建議與行動方案

為了修復上述問題並滿足新需求，我建議進行以下修改：

### 2.1 後端修改 (Backend)

1. **修復 PaymentOut 查詢錯誤**：
   在 `calcCosts` 方法中，將 `paymentOutWhere.project = { company_id: companyId }` 修改為 `paymentOutWhere.company_id = companyId`。

2. **加入軟刪除（Soft Delete）過濾**：
   在所有查詢（Expense, Invoice 等）中加入 `deleted_at: null` 的條件，確保已刪除的記錄不會影響損益計算。

3. **優化支出（Expense）分類**：
   確保由糧單生成的支出（`source: 'PAYROLL'`）能正確歸類到「直接成本」或「間接成本」中，並在明細中清晰顯示。

4. **加入會計年度計算邏輯**：
   在 `CompanyProfitLossService.buildDateRange` 方法中，加入 `financial_year` 的處理邏輯。當選擇會計年度（例如 2023/24）時，日期範圍應設定為 2023-04-01 至 2024-03-31。

### 2.2 前端修改 (Frontend)

1. **新增會計年度篩選選項**：
   在 `CompanyProfitLossPage` 的 Period 下拉選單中加入「會計年度（4月至翌年3月）」選項。
   
2. **會計年度年份選擇器**：
   當選擇會計年度時，年份選擇器應顯示如「2023/24年度」的格式，而不是單一的自然年。

3. **調整 API 請求參數**：
   當選擇會計年度時，向後端發送 `period: 'financial_year'` 以及對應的起始年份。

---

接下來，我將開始實施這些修改，確保損益表能準確反映公司的財務狀況，並支援會計年度的篩選。
