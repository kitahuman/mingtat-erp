# 糧單延伸功能設計

## 新流程
1. 選擇員工 + 日期範圍 → 按「計算」
2. **新中間步驟**：系統從 work_logs 複製到 payroll_work_logs（獨立副本），但此時還沒有 payroll 記錄
3. 用戶可在糧單工作紀錄頁面編輯（改計算單位等），不影響原始 work_logs
4. 編輯完後，按「生成糧單」→ 使用 payroll_work_logs 的數據計算並生成 payroll
5. 糧單可儲存
6. 之後可回去編輯糧單工作紀錄，重新計算（覆蓋之前的糧單）

## 設計方案

### 方案：在現有 Payroll + PayrollWorkLog 架構上延伸

**核心改動**：
- generate 改為兩步驟：
  1. Step 1: `POST /payroll/prepare` - 建立 draft payroll（status='preparing'），複製 work_logs 到 payroll_work_logs
  2. Step 2: 用戶在 `/payroll/{id}` 頁面編輯 payroll_work_logs（已有此功能）
  3. Step 3: `POST /payroll/{id}/recalculate` - 用 payroll_work_logs 重新計算（已有此功能）

**好處**：
- 重用現有的 PayrollWorkLog model 和編輯功能
- 重用現有的 recalculate 邏輯
- 最小改動量

**具體改動**：

### 後端
1. 新增 `POST /payroll/prepare` endpoint：
   - 建立 payroll（status='preparing'），只有基本資訊
   - 從 work_logs 複製到 payroll_work_logs（帶 price enrichment）
   - 返回 payroll id

2. 修改 `generate` 或新增 `POST /payroll/{id}/finalize-draft`：
   - 從 payroll_work_logs 計算糧單
   - 更新 payroll 的金額欄位
   - 狀態改為 'draft'

3. 修改 `recalculate`：已經使用 payroll_work_logs，不需要改

### 前端
1. 修改 `/payroll/page.tsx`（計糧管理頁面）：
   - 「計算」按鈕改為「準備糧單」
   - 調用 prepare API 後跳轉到 `/payroll/{id}`

2. 修改 `/payroll/[id]/page.tsx`（糧單詳情頁面）：
   - 當 status='preparing' 時，顯示「編輯工作紀錄」模式
   - 編輯完後按「生成糧單」→ 調用 recalculate → 狀態改為 'draft'
