# 公司損益表（P&L）功能修改報告

## 一、檢視結果：發現的問題

經過對公司損益表的前端頁面、後端 Service、Controller 以及 Prisma Schema 的全面檢視，發現以下問題：

| 問題編號 | 問題描述 | 嚴重程度 | 影響範圍 |
|---------|---------|---------|---------|
| 1 | PaymentOut 查詢使用了不存在的 `project` 關聯 | 高 | 按公司篩選時應付帳款計算錯誤或崩潰 |
| 2 | Expense 查詢未過濾軟刪除記錄（`deleted_at`） | 高 | 已刪除的支出仍被計入成本，導致成本虛高 |
| 3 | Invoice 查詢未過濾軟刪除記錄 | 中 | 已刪除的發票仍被計入收入 |
| 4 | 缺少會計年度（4月至翌年3月）篩選 | 中 | 無法按公司實際會計年度查看損益表 |
| 5 | 缺少糧單相關的摘要資訊 | 低 | 無法直觀看到糧單對成本的影響 |

### 問題 1 詳細說明

在 `CompanyProfitLossService.calcCosts()` 方法中，計算應付帳款時使用了以下查詢：

```typescript
// 錯誤：PaymentOut 模型沒有 project 關聯
paymentOutWhere.project = { company_id: companyId };
```

但 `PaymentOut` 模型只有 `company_id`、`expense_id` 和 `payroll_id` 三個關聯，並沒有 `project` 關聯。這會導致 Prisma 在執行查詢時拋出錯誤。

### 問題 2 詳細說明

`Expense` 模型支持軟刪除（`deleted_at` 欄位），但損益表在查詢支出時沒有加入 `deleted_at: null` 的過濾條件。特別是糧單功能會在「取消確認」時刪除自動生成的支出記錄（透過 `deleteBySourceRef`），如果不過濾軟刪除記錄，這些已刪除的支出會被重複計算。

### 糧單與損益表的關聯分析

目前系統的設計流程是：

1. 糧單確認後 → 自動生成 `Expense` 記錄（`source: 'PAYROLL'`）
2. 糧單付款後 → 自動生成 `PaymentOut` 記錄（`payroll_id` 關聯）
3. 損益表透過統計 `Expense` 來計算成本 → **糧單成本已自動包含在內**

因此，損益表不需要額外查詢 `Payroll` 表來計算成本（否則會重複計算），只需確保 `Expense` 查詢正確過濾軟刪除記錄即可。

---

## 二、修改內容

### 後端修改（`company-profit-loss.service.ts`）

**修復 1：PaymentOut 查詢**

將錯誤的 `project` 關聯改為直接使用 `company_id`：

```typescript
// 修復前
paymentOutWhere.project = { company_id: companyId };

// 修復後
paymentOutWhere.company_id = companyId;
```

**修復 2：加入軟刪除過濾**

在所有 `Expense` 和 `Invoice` 查詢中加入 `deleted_at: null`：

```typescript
const projectExpenseWhere: any = {
  project_id: { not: null },
  deleted_at: null,  // 新增
};
```

**新增 3：會計年度日期計算**

在 `buildDateRange` 方法中新增 `financial_year` 和 `fy_quarter` 的支持：

- `financial_year`：year 參數代表起始年份，例如 year=2025 → 2025-04-01 至 2026-03-31
- `fy_quarter`：FQ1(4-6月)、FQ2(7-9月)、FQ3(10-12月)、FQ4(翌年1-3月)

**新增 4：糧單摘要統計**

新增 `calcPayrollCosts()` 方法，統計：
- 糧單產生的支出總額（`source: 'PAYROLL'` 的 Expense）
- 已確認/已付糧單數量
- 糧單相關的 PaymentOut 總額
- 未付糧單款項

### 前端修改（`company-profit-loss/page.tsx`）

**新增 5：會計年度篩選**

- Period 下拉選單新增「會計年度（4月-翌年3月）」和「會計季度」選項
- 預設選擇「會計年度」而非「自然年度」
- 年份選擇器在會計年度模式下顯示如「2025/26年度」的格式
- 會計季度選項：FQ1(4-6月)、FQ2(7-9月)、FQ3(10-12月)、FQ4(1-3月)

**新增 6：報表期間資訊**

- 新增報表期間 Banner，清晰顯示當前查看的日期範圍
- 列印表頭也顯示完整的會計年度資訊

**新增 7：糧單摘要區塊**

- 在成本明細和損益計算之間新增「糧單摘要」區塊
- 顯示糧單數量、支出總額、已付/未付款項
- 附帶說明文字：「糧單確認後自動產生的支出已包含在上方成本明細中」

---

## 三、修改的文件清單

| 文件路徑 | 修改類型 |
|---------|---------|
| `backend/src/company-profit-loss/company-profit-loss.service.ts` | 修改 |
| `frontend/src/app/(main)/company-profit-loss/page.tsx` | 修改 |

---

## 四、收入與支出項目完整性確認

### 收入項目（已確認完整）

| 項目 | 來源 | 狀態 |
|------|------|------|
| 工程收入（累計認證） | PaymentApplication | 正常 |
| 發票收入 | Invoice（已加入 deleted_at 過濾） | 已修復 |
| 其他收入 | PaymentIn (source_type='other') | 正常 |
| 累計已收款 | PaymentIn | 正常 |
| 應收帳款 | 收入總計 - 已收款 | 正常 |

### 支出項目（已確認完整）

| 項目 | 來源 | 狀態 |
|------|------|------|
| 工程直接成本 | Expense (project_id 非空, 非 OVERHEAD)（已加入 deleted_at 過濾） | 已修復 |
| 工程間接成本 | Expense (project_id 非空, OVERHEAD)（已加入 deleted_at 過濾） | 已修復 |
| 公司營運開支 | Expense (project_id 為空)（已加入 deleted_at 過濾） | 已修復 |
| 糧單支出 | 透過 Expense (source='PAYROLL') 自動包含 | 正常 |
| 累計已付款 | PaymentOut（已修復 company_id 過濾） | 已修復 |
| 應付帳款 | 成本總計 - 已付款 | 正常 |

### 計算邏輯（已確認正確）

| 計算項 | 公式 | 狀態 |
|--------|------|------|
| 毛利 | 收入總計 - 直接成本 | 正確 |
| 毛利率 | 毛利 / 收入總計 × 100% | 正確 |
| 營業利潤 | 毛利 - 間接成本 - 營運開支 | 正確 |
| 淨利率 | 營業利潤 / 收入總計 × 100% | 正確 |
