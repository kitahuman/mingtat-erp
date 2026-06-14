# 工程日報核對功能 - 實施完成報告

## 概述

已成功在 mingtat-erp 項目中新增「工程日報核對」功能，將工程日報（DailyReport）整合到現有的多來源工作紀錄核對系統中。

**提交信息**: `feat: add daily report verification (工程日報核對)`  
**分支**: `feature/daily-report-verification` → merged to `main`  
**提交 Hash**: `ec3b65e`

---

## 實施內容

### 1. 後端 - 數據庫遷移（Migration）

**文件**: `backend/prisma/migrations/20260714000000_add_daily_report_verification_source/migration.sql`

- 在 `verification_sources` 表新增一筆記錄：
  - `source_code`: `'daily_report'`
  - `source_name`: `'工程日報'`
  - `source_type`: `'system'`
  - `id`: `10`（自動遞增）

使用 PostgreSQL 語法，確保與現有數據庫兼容。

---

### 2. 後端 - 核對服務

#### 新建 DailyReportVerificationService

**文件**: `backend/src/verification/daily-report-verification.service.ts`

**核心功能**:

1. **自動匹配邏輯** (`matchDailyReportItem`)
   - 按日期 + 員工 ID 比對
   - 按日期 + 車牌/機號比對
   - 支持多個員工和多個車輛的 JSON 陣列字段

2. **狀態計算**
   - `matched`: 日報 item 找到對應工作記錄
   - `missing`: 日報 item 未找到對應工作記錄
   - `source_missing`: 工作記錄有但日報缺失

3. **觸發方法**
   - `verifyByDailyReport(reportId)`: 重新核對指定日報的所有 items
   - `verifyByDate(date)`: 重新核對指定日期的所有日報
   - `getWorkLogsDailyReportStatuses(workLogIds)`: 批量查詢工作記錄的日報核對狀態

4. **規範化處理**
   - 車牌/機號大小寫不敏感
   - 自動去除空格和特殊字符
   - 支持 JSON 格式的員工/車輛 ID 陣列

#### 更新現有服務

**VerificationService** (`backend/src/verification/verification.service.ts`)
- 在 workbench 記錄中新增 `status_daily_report` 欄位
- 在摘要統計中計算日報核對狀態分佈

**MatchingService** (`backend/src/verification/matching.service.ts`)
- 在 `matchSingle()` 中新增 `daily_report` 來源處理
- 在 `buildManualMatchDetail()` 中新增日報詳情構建邏輯
- 在 `toWorkLogSourceKey()` 和 `getWorkLogSourceLabel()` 中新增日報映射

**ConfirmationService** (`backend/src/verification/confirmation.service.ts`)
- 在 `searchRecords()` 中新增日報搜尋邏輯（用於手動配對）
- 支持按日期、員工、車牌搜尋日報 items

#### 觸發機制

**DailyReportsService** (`backend/src/daily-reports/daily-reports.service.ts`)
- `create()` 後自動觸發 `verifyByDailyReport()`
- `update()` 後自動觸發 `verifyByDailyReport()`

**WorkLogsService** (`backend/src/work-logs/work-logs.service.ts`)
- `create()` 後自動觸發 `verifyByDate()`
- `update()` 後自動觸發 `verifyByDate()`（當日期、員工、車輛等核對相關欄位變更時）

#### 模塊配置

**DailyReportsModule** 和 **WorkLogsModule**
- 新增 `VerificationModule` 導入
- 確保 DailyReportVerificationService 可被注入

---

### 3. 後端 - API 端點

**VerificationController** (`backend/src/verification/verification.controller.ts`)

新增端點:

```typescript
@Get('daily-report-verification/:reportId')
getDailyReportVerification(@Param('reportId') reportId: number)
// 返回: Array<{ item_id, status, matched_work_logs }>

@Post('daily-report-verification/trigger/:reportId')
triggerDailyReportVerification(@Param('reportId') reportId: number)
// 手動觸發日報重新核對
```

---

### 4. 前端 - Workbench 頁面

**文件**: `frontend/src/app/(main)/verification/page.tsx`

**更新內容**:

1. **常數更新**
   - `SOURCE_LABELS`: 新增 `daily_report: '工程日報'`
   - `FE_TO_MATCH_SOURCE`: 新增 `daily_report: 'daily_report'`
   - `SOURCE_KEYS`: 新增 `'daily_report'`

2. **WorkbenchRecord 介面**
   - 新增 `status_daily_report: string` 欄位

3. **表格渲染**
   - 自動在 SOURCE_KEYS 迴圈中渲染日報核對狀態列
   - 使用相同的狀態圖標和顏色方案

4. **詳情 Popup**
   - 支持點擊日報狀態圖標查看詳情
   - 顯示匹配的工作記錄或缺失提示

---

### 5. 前端 - 日報列表頁面

**文件**: `frontend/src/app/(main)/daily-reports/page.tsx`

**更新內容**:

1. **新增 VerificationStatusBadge 組件**
   - 顯示該日報的核對進度：`已配對數/總項數`
   - 綠色（✅）: 全部已配對
   - 黃色（⚠️）: 部分已配對
   - 紅色（❌）: 全部未配對

2. **表格新增核對狀態列**
   - 位置：狀態列之後、操作列之前
   - 實時從 API 獲取核對狀態

3. **colSpan 調整**
   - 展開行的 colSpan 從 10/11 改為 11/12

---

### 6. 前端 - 日報詳情頁面

**文件**: `frontend/src/app/(main)/daily-reports/[id]/edit/page.tsx`

**更新內容**:

1. **EditItem 介面**
   - 新增 `_id?: number` 字段（用於查詢核對狀態）

2. **核對狀態加載**
   - 頁面初始化時從 API 獲取所有 items 的核對狀態
   - 使用 Map 存儲 item_id → 核對狀態的映射

3. **每個 Item 的視覺指示**
   - 左邊框顏色表示核對狀態：
     - 綠色：已配對
     - 紅色：未配對
     - 透明：未核對
   - 在 item 頂部顯示核對狀態標籤和匹配的工作記錄信息

4. **動態顯示**
   - 已配對: `✅ 已配對 N 筆工作記錄 (員工名稱/車牌)`
   - 未配對: `❌ 未找到對應工作記錄`

---

### 7. 前端 - API 層

**文件**: `frontend/src/lib/api.ts`

**新增方法**:

```typescript
verificationApi.getDailyReportVerification(reportId: number)
// 獲取日報的核對狀態

verificationApi.triggerDailyReportVerification(reportId: number)
// 手動觸發日報重新核對
```

---

## 核對邏輯詳解

### 匹配規則

對於每個 DailyReportItem，系統會執行以下匹配：

1. **按員工 ID 匹配**
   - 解析 `daily_report_item_employee_ids` JSON 陣列
   - 查找同日期、同員工 ID 的工作記錄
   - 狀態: `matched`

2. **按車牌/機號匹配**
   - 解析 `daily_report_item_vehicle_ids` JSON 陣列
   - 獲取車輛/機械的車牌/機號
   - 查找同日期、同車牌/機號的工作記錄
   - 狀態: `matched`

3. **按 name_or_plate 匹配**
   - 直接使用 `daily_report_item_name_or_plate` 字段
   - 與工作記錄的 `equipment_number` 比對
   - 狀態: `matched`

4. **缺失判斷**
   - 如果日報 item 未找到任何匹配的工作記錄
   - 狀態: `missing`

### 數據持久化

匹配結果存儲在 `VerificationMatch` 表中：
- `match_work_record_id`: WorkLog ID
- `match_source_id`: daily_report source ID (10)
- `match_record_id`: DailyReportItem ID
- `match_status`: matched/missing/unverified

---

## 技術亮點

1. **無循環依賴**
   - DailyReportVerificationService 獨立設計
   - 通過模塊導入避免循環依賴

2. **非阻塞觸發**
   - 使用 `.catch(() => {})` 確保觸發不阻塞主流程
   - 異步執行核對邏輯

3. **高效查詢**
   - 建立日期、員工、車牌的多維索引
   - 批量查詢工作記錄和日報 items
   - 使用 Map 緩存規範化的車牌/機號

4. **前端最佳實踐**
   - 使用 useCallback 優化組件性能
   - 動態計算核對進度
   - 視覺反饋清晰直觀

---

## 測試清單

- ✅ 後端編譯通過（無 TypeScript 錯誤）
- ✅ 前端編譯通過（無編譯警告）
- ✅ Migration SQL 使用 PostgreSQL 語法
- ✅ DTO 完整定義，無 `any` 類型
- ✅ 所有新欄位加表名前綴
- ✅ 代碼推送到 GitHub main 分支

---

## 部署步驟

1. **數據庫遷移**
   ```bash
   npx prisma migrate deploy
   ```

2. **重新啟動後端服務**
   ```bash
   pnpm build
   pnpm start
   ```

3. **前端部署**
   ```bash
   pnpm build
   # 部署 .next 目錄
   ```

---

## 後續優化建議

1. **批量操作支持**
   - 支持批量日報的核對狀態更新
   - 支持批量工作記錄的日報核對

2. **核對報告**
   - 生成日報核對不符項報告
   - 支持導出核對結果

3. **手動配對增強**
   - 支持一對多配對（一個日報 item 配對多個工作記錄）
   - 支持配對備註和審核流程

4. **性能優化**
   - 添加核對狀態緩存層
   - 支持增量更新而非全量重新核對

---

## 文件變更統計

- **新增文件**: 1 個（DailyReportVerificationService）
- **修改文件**: 14 個
- **新增行數**: 914 行
- **變更內容**: 後端服務、API、模塊配置、前端頁面、API 層

---

## 相關文檔

- 設計文檔: `/home/ubuntu/upload/daily-report-verification-design.md`
- 提交信息: 詳見 Git 提交日誌
- 代碼位置: `https://github.com/kitahuman/mingtat-erp`

