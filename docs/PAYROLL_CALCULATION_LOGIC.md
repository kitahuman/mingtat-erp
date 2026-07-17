# 糧單計算邏輯 (Payroll Calculation Logic)

這份文件記錄了 Mingtat ERP 系統中薪酬計算的完整邏輯，涵蓋了計算流程、日薪與月薪的計算差異、津貼系統、OT 計算、MPF 計算等核心機制。

## 1. 計算流程概覽

糧單的計算流程主要由 `backend/src/payroll/payroll.service.ts` 控制，並呼叫 `backend/src/payroll/payroll-calculation.service.ts` 中的 `calculatePayroll` 作為核心計算函式。

在 **prepare 流程**中，系統會先建立 `preparing` 狀態的糧單與 `payroll_work_logs` 快照，再由 `finalizePreparation` 將狀態轉成 `draft`。當用戶在前端編輯逐日記錄或津貼時，會觸發 **recalculate 流程**。此流程會重抓 `payroll_work_logs` 快照、重算價錢、刪除再重建 `auto` 的 daily allowances、載入 `getCalculationDailyAllowances` 與手動 day quantity map，最後交給 `calculatePayroll` 進行處理。

`calculatePayroll` 是 `preview`、`generate`、`recalculate` 共用的核心函式。在其內部，會先呼叫 `buildDailyCalculation` 取得逐日計算結果，這是整個薪酬計算的 single source of truth。

## 2. 薪金計算邏輯對比

日薪與月薪員工的薪金計算方式有顯著差異，主要體現在工作收入的認定與假日的處理上。

| 項目 | 日薪員工 | 月薪員工 |
| :--- | :--- | :--- |
| **基礎計算** | 工作收入為所有工作記錄的 `line_amount` 總和（不減 OT 與中直津貼）。 | 日薪 = `Math.floor(月薪 × 12 ÷ 365)`（閏年為 366）。 |
| **補底薪/基本薪金** | 若當天 `line_amount` 總和小於 `base_salary`，補足差額：`Σ max(base_salary - 當天 Σ line_amount, 0)`。 | 視乎有無請假決定基本薪金為月薪封頂或按計糧天數計算。 |
| **天數計算** | 依據實際工作日與夜班數量。 | 計糧天數 = 實際工作天數 + 星期日 + 法定假日（入職首3月不計法定假日）。 |
| **額外津貼** | 無特定額外工作津貼機制。 | 若實際工作天數 ≥ 應工作天數（當月天數 - 星期日 - 法定假日），發放額外工作津貼 = `(實際工作天數 - 應工作天數) × 日薪`。假日上班會計入計糧天數與額外天數。 |

對於日薪員工，**base_line_amount**（純工作收入）定義為 `line_amount - ot_line_amount - mid_shift_line_amount`。這個值是即時計算的，不會存入資料庫。

## 3. 津貼系統與排除機制

津貼系統分為固定津貼與手動津貼，並設有排除機制以支援用戶手動調整，確保系統重算時不會覆蓋用戶的修改。

**固定津貼**來自 `salary setting` 配置，系統會自動生成。其觸發條件 (`trigger_type`) 包含 `every_work_day`、`day_shift_only`、`night_shift_only`、`specific_client`、`specific_weekday` 以及 `manual`。`buildDailyFixedAllowanceDisplay` 負責每天生成固定津貼。為防止重複，如果資料庫中已有同 key 的 daily allowance，或存在對應的 `excluded_` 記錄，系統將跳過生成。

**手動津貼**是用戶在逐日計算頁面手動新增的項目，存在 `PayrollDailyAllowance` 表中，key 的格式為 `custom:名稱`，並透過 `dailyAllowancesByKey` 迴圈進行匯總。

**`excluded_` 記錄機制**的用途是防止固定津貼在 `recalculate` 後被系統重新生成。當用戶在逐日計算頁面按 × 刪除一個 `is_auto=true` 的津貼時，系統會建立格式為 `excluded_{原始key}_{日期}` 或 `excluded_{原始key}` 的記錄。這項記錄只會影響 `buildDailyFixedAllowanceDisplay`，阻止固定津貼生成，但不會影響 `dailyAllowancesByKey` 的匯總。`getCalculationDailyAllowances` 必須包含 `excluded_` 記錄，讓生成邏輯能正確識別並跳過。前端則會透過 `isExcludedAllowance` 過濾掉這些記錄使其不顯示。

在**糧單項目匯總**階段，系統會將來自 `fixed_allowances_per_day` 的 `fixedAllowancesByType` 與來自 `day.daily_allowances` 的 `dailyAllowancesByKey` 合併生成 `payroll items`。前端顯示時，會按 `item_name + unit_price` 分組，同名同價的項目會合併並標註「X筆合併」。

## 4. OT 與 MPF 計算

**OT 計算**是每條 `workLog` 獨立重置的。OT 時段費率來自 `salary setting`（如 `ot_1800_1900` 等）。需要注意的是，客戶的 `matched_ot_rate` 是工作紀錄收入的一部分，歸入 `line_amount` / `work_income`，與員工薪金的 OT 津貼完全無關。

**MPF 計算**方面，65 歲以上的員工免除 MPF 供款。MPF 天數的計算則是使用 `day_quantity + night_quantity`。

## 5. 已知陷阱與修正記錄

系統在開發過程中發現並修正了幾個關鍵邏輯問題，記錄如下：

| 修正日期 | 問題描述 | 修正方式 |
| :--- | :--- | :--- |
| 2026-07-17 | excludedBadgeKeys 全域排除 bug | 修正 per-day excluded 記錄，確保其不會全域排除整月津貼。 |
| 2026-07-17 | 月薪封頂判斷 bug | 應用「實際工作天數 ≥ 應工作天數」的邏輯來正確判斷員工有沒有請假。 |
| 2026-07-17 | getCalculationDailyAllowances 過濾 bug | 確保查詢結果必須包含 `excluded_` 記錄，讓 `buildDailyFixedAllowanceDisplay` 能正確跳過被排除的津貼。 |
