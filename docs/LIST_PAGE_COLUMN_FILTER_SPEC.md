# 列表頁面欄頂篩選/排序/欄位配置 技術規範

> **基準版本**: commit `958ba67` (2026-06-24)
> **適用範圍**: 所有使用 `ColumnFilter`、`DataTable`、`InlineEditDataTable`、`useColumnConfig` 的列表頁面
> **本文件用途**: 任何 AI agent 或工程師在修改列表頁面相關功能時，必須參照本文件確保一致性

---

## 1. 架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        列表頁面 (page.tsx)                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │ 頂部篩選面板  │  │ 欄位配置面板  │  │ 匯出/批量操作按鈕   │    │
│  │ (Top Filters)│  │(ColumnCustom)│  │                     │    │
│  └──────┬───────┘  └──────┬───────┘  └─────────────────────┘    │
│         │                  │                                      │
│  ┌──────▼──────────────────▼──────────────────────────────────┐  │
│  │                    表格 <table>                              │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ <thead> 欄位標題列                                    │   │  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐                   │   │  │
│  │  │  │排序按鈕 │ │排序按鈕 │ │排序按鈕 │  ...              │   │  │
│  │  │  │篩選下拉 │ │篩選下拉 │ │篩選下拉 │                   │   │  │
│  │  │  │(Column │ │(Column │ │(Column │                   │   │  │
│  │  │  │ Filter)│ │ Filter)│ │ Filter)│                   │   │  │
│  │  │  └────────┘ └────────┘ └────────┘                   │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ <tbody> 資料列                                        │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 資料流程

```
用戶操作欄頂篩選
       │
       ▼
前端 onFilterChange(key, selectedValues)
       │
       ▼
更新 columnFilters state: { [columnKey]: string[] }
       │
       ├──► 觸發 findAll API (帶所有 filter_xxx 參數) → 更新列表資料
       │
       └──► 當用戶打開另一個欄的篩選下拉時:
              │
              ▼
         onFetchOptions(key) 被呼叫
              │
              ▼
         buildListParams({}, { excludeColumnFilter: key })
         → 包含: 頂部篩選 + 其他欄頂篩選 (排除自身)
              │
              ▼
         POST /api/work-logs/filter-options/:column
              │
              ▼
         後端 getFilterOptions(column, query)
              │
              ▼
         buildWorkLogWhere(query, excludeColumn=column)
         → 套用所有條件但排除目標欄位自身的 filter
              │
              ▼
         回傳該欄位的不重複值清單 (最多 500 個)
```

---

## 3. 前端組件詳細規格

### 3.1 ColumnFilter 組件

**檔案位置**: `frontend/src/components/ColumnFilter.tsx`

**Props 介面**:

| Prop | 類型 | 必填 | 說明 |
|------|------|------|------|
| `columnKey` | `string` | ✅ | 欄位的 key，對應後端 columnFilterFields |
| `data` | `any[]` | ✅ | 當前頁面的資料列（client-side 模式用） |
| `activeFilters` | `Record<string, Set<string>>` | ✅ | 所有欄位的已選篩選值 |
| `onFilterChange` | `(key: string, vals: Set<string> \| null) => void` | ✅ | 篩選變更回調。`null` = 清除篩選（全選） |
| `renderValue` | `(value: any, row: any) => string` | ❌ | client-side 模式的值渲染函數 |
| `serverSide` | `boolean` | ❌ | 是否使用 server-side 選項取得 |
| `onFetchOptions` | `(key: string) => Promise<string[]>` | ❌ | server-side 模式的選項取得函數 |
| `optionRender` | `(value: string) => string` | ❌ | 選項顯示文字的轉換函數 |
| `displayToRawMap` | `Record<string, string>` | ❌ | 顯示值→原始值的映射 |

**核心行為**:

1. **選項載入時機**: 每次下拉打開時（`isOpen` 變為 `true`）重新從後端取得選項
2. **Ref 機制**: `onFetchOptions` 存入 `useRef`，確保每次呼叫都用最新的閉包（包含最新的 state）
3. **虛擬滾動**: 選項列表使用虛擬滾動渲染，行高 32px，最大高度 288px，overscan 8 行
4. **搜尋**: 支援即時搜尋過濾選項（前端過濾已載入的選項）
5. **全選/取消全選**: `onFilterChange(key, null)` 表示全選（清除篩選），`onFilterChange(key, new Set())` 表示全不選

**選擇邏輯**:

- 初始狀態: 全選（`activeFilters[columnKey]` 為 `undefined`）
- 用戶取消勾選某個值: 建立 Set 包含所有值除了被取消的
- 用戶勾選回所有值: 傳 `null` 清除篩選
- 搜尋狀態下點擊: 只選中被點擊的值

### 3.2 buildListParams 函數

**位置**: 各列表頁面的 `page.tsx` 內（`useCallback`）

**簽名**:
```typescript
const buildListParams = useCallback(
  (
    overrides: Record<string, unknown> = {},
    {
      skipColumnFilters = false,
      excludeColumnFilter
    }: {
      skipColumnFilters?: boolean;
      excludeColumnFilter?: string;
    } = {}
  ) => { ... }
)
```

**參數說明**:

| 參數 | 說明 |
|------|------|
| `overrides` | 額外參數覆蓋（如 `{ page: 1, limit: 100000 }`） |
| `skipColumnFilters` | `true` = 完全不傳任何 `filter_xxx` 參數（用於頂部篩選選項取得） |
| `excludeColumnFilter` | 排除指定欄位的 filter（用於欄頂篩選選項取得，實現聯動） |

**輸出的參數格式**:

```typescript
{
  sortBy: string,
  sortOrder: string,
  publisher_id?: string,      // 頂部篩選: 逗號分隔的 ID
  status?: string,            // 頂部篩選
  company_id?: string,        // 頂部篩選
  client_id?: string,         // 頂部篩選
  quotation_id?: string,      // 頂部篩選
  contract_id?: string,       // 頂部篩選
  employee_id?: string,       // 頂部篩選
  fleet_driver_id?: string,   // 頂部篩選
  equipment_number?: string,  // 頂部篩選
  date_from?: string,         // 頂部篩選: YYYY-MM-DD
  date_to?: string,           // 頂部篩選: YYYY-MM-DD
  filter_client?: string,     // 欄頂篩選: JSON.stringify(["值1","值2"])
  filter_machine_type?: string, // 欄頂篩選
  filter_xxx?: string,        // 其他欄頂篩選...
}
```

**關鍵規則**:
- 欄頂篩選參數名稱格式: `filter_${columnKey}`
- 值格式: `JSON.stringify(string[])`
- `excludeColumnFilter` 會跳過指定 key 的 filter，其他 filter 照常傳送

### 3.3 onFetchOptions 呼叫方式

```typescript
onFetchOptions={async (key) => {
  const res = await workLogsApi.filterOptions(
    key,
    buildListParams({}, { excludeColumnFilter: key }),
  );
  return res.data as string[];
}}
```

**重要**: 使用 `excludeColumnFilter: key` 而非 `skipColumnFilters: true`。這確保：
- 頂部篩選條件（日期、客戶等）會被套用
- 其他欄頂篩選條件會被套用
- 只有目標欄位自身的篩選被排除（避免循環限制）

### 3.4 useColumnConfig Hook

**檔案位置**: `frontend/src/hooks/useColumnConfig.ts`

**用途**: 管理欄位的顯示/隱藏、排序、寬度偏好

**關鍵常數**:
```typescript
const COLUMN_CONFIG_VERSION = 5; // 當前版本
```

**使用方式**:
```typescript
const {
  columnConfigs,        // ColumnConfig[] - 所有欄位配置
  visibleColumns,       // 過濾後的可見欄位（已排序）
  columnWidths,         // Record<string, number> - 欄位寬度
  handleColumnConfigChange,  // 更新配置
  handleReset,               // 重設為預設
  handleSavePersonal,        // 儲存個人偏好到 API
  handleSaveDefault,         // 儲存為全域預設
  handleColumnResize,        // 調整欄位寬度
} = useColumnConfig('work-logs', COLUMNS.map(c => ({ key: c.key, label: c.label })));
```

**偏好載入優先順序**:
1. API 個人偏好 → 2. API 全域預設 → 3. localStorage → 4. 代碼預設

**版本控制機制**:
- localStorage 存 `column-config-version-{pageKey}`
- 若版本不符 `COLUMN_CONFIG_VERSION`，強制重置為預設
- **新增欄位時必須 bump 此版本號**

### 3.5 COLUMNS 定義

```typescript
const COLUMNS = [
  { key: 'publisher', label: '發佈人', width: 'w-24' },
  { key: 'status', label: '狀態', width: 'w-20' },
  // ... 每個欄位都有 key, label, width
];
```

### 3.6 COLUMN_SORT_FIELD 映射

```typescript
const COLUMN_SORT_FIELD: Record<string, string> = {
  publisher: 'publisher',
  status: 'status',
  scheduled_date: 'scheduled_date',
  // ... 定義哪些欄位可排序，以及對應的後端排序欄位名
};
```

- 有定義 = 可排序，點擊欄位標題觸發排序
- 未定義 = 不可排序

### 3.7 activeColumnFilters 狀態

```typescript
// columnFilters: Record<string, string[]> (存在 pageState 中，持久化到 sessionStorage)
// activeColumnFilters: Record<string, Set<string>> (useMemo 轉換，傳給 ColumnFilter)
const activeColumnFilters = useMemo<Record<string, Set<string>>>(
  () => Object.fromEntries(
    Object.entries(columnFilters).map(([key, values]) => [key, new Set(values)]),
  ),
  [columnFilters],
);
```

---

## 4. 後端 API 詳細規格

### 4.1 filter-options 端點

**Controller**: `work-logs.controller.ts`

```typescript
@SkipThrottle()
@Get('filter-options/:column')
getFilterOptions(@Param('column') column: string, @Query() query: any) {
  return this.service.getFilterOptions(column, query);
}

@SkipThrottle()
@Post('filter-options/:column')
postFilterOptions(@Param('column') column: string, @Body() body: any) {
  return this.service.getFilterOptions(column, body);
}
```

**路由**: `GET/POST /api/work-logs/filter-options/:column`

**前端使用 POST 方法**（因為參數可能很長）

### 4.2 getFilterOptions 方法

```typescript
async getFilterOptions(column: string, query: WorkLogQuery = {}): Promise<string[]>
```

**流程**:
1. 檢查 `column` 是否在 `columnFilterFields` 中，否則回傳空陣列
2. 呼叫 `buildWorkLogWhere(query, column)` — 注意第二個參數是 `column`，會排除自身篩選
3. 根據欄位類型執行不同查詢邏輯
4. 回傳最多 500 個不重複值

### 4.3 columnFilterFields（可篩選欄位清單）

```typescript
private readonly columnFilterFields = [
  'publisher',
  'status',
  'scheduled_date',
  'wl_whatsapp_reported_at',
  'service_type',
  'work_content',
  'company',
  'client',
  'quotation',
  'client_contract_no',
  'contract',
  'employee',
  'tonnage',
  'machine_type',
  'equipment_number',
  'day_night',
  'start_location',
  'start_time',
  'end_location',
  'end_time',
  'work_order_no',
  'receipt_no',
  'quantity',
  'unit',
  'ot_quantity',
  'ot_unit',
  'is_mid_shift',
  'goods_quantity',
  'work_log_product_name',
  'work_log_product_unit',
  'is_confirmed',
  'is_paid',
  'source',
  'remarks',
];
```

### 4.4 relationFilterConfig（關聯欄位配置）

```typescript
private readonly relationFilterConfig: Record<
  string,
  { relation: string; field: string; foreignKey: string }
> = {
  publisher: { relation: 'publisher', field: 'displayName', foreignKey: 'publisher_id' },
  company:   { relation: 'company',   field: 'name',        foreignKey: 'company_id' },
  client:    { relation: 'client',    field: 'name',        foreignKey: 'client_id' },
  quotation: { relation: 'quotation', field: 'quotation_no', foreignKey: 'quotation_id' },
  contract:  { relation: 'contract',  field: 'contract_no', foreignKey: 'contract_id' },
};
```

**用途**: 這些欄位的值來自關聯表，篩選時需要 JOIN 查詢

### 4.5 欄位類型分類

| 類型 | 欄位 | 篩選邏輯 |
|------|------|----------|
| 關聯欄位 | publisher, company, client, quotation, contract | 透過 relation JOIN 查詢 |
| 特殊關聯 | employee | 同時查 employee + fleet_driver 兩個關聯 |
| 日期欄位 | scheduled_date, wl_whatsapp_reported_at | 日期範圍比對 |
| 布林欄位 | is_mid_shift, is_confirmed, is_paid | 「是」/「否」轉 true/false |
| 數值欄位 | quantity, ot_quantity, goods_quantity | 數值精確比對 |
| 一般文字 | 其餘所有欄位 | 字串精確比對（支援多值 IN） |

### 4.6 applyColumnFilters 方法

```typescript
private applyColumnFilters(
  where: WhereClause,
  query: WorkLogQuery,
  excludeColumn?: string,
)
```

**核心邏輯**:
1. 遍歷 `columnFilterFields`
2. 跳過 `excludeColumn`（如果指定）
3. 從 `query[filter_${field}]` 取得篩選值
4. 用 `splitFilterValues` 解析（支援 JSON 陣列格式和逗號分隔格式）
5. 分離「空白」值和「非空白」值
6. 根據欄位類型建構 Prisma where 條件

**空白值處理**:
- `(空白)`、`__BLANK__`、空字串 都視為「空白」
- 空白條件: `{ field: null }` 或 `{ field: '' }`

### 4.7 buildWorkLogWhere 方法

```typescript
private buildWorkLogWhere(
  query: WorkLogQuery,
  excludeColumnFilter?: string,
): WhereClause
```

**處理順序**:
1. 初始化 `where = { deleted_at: null }`（soft-delete 保護）
2. 套用頂部篩選條件（publisher_id, status, company_id, client_id, date_from, date_to 等）
3. 呼叫 `applyColumnFilters(where, query, excludeColumnFilter)` 套用欄頂篩選

### 4.8 WorkLogQuery 介面

```typescript
export interface WorkLogQuery extends PaginationQuery {
  company_id?: string | number;
  company_profile_id?: string | number;
  client_id?: string | number;
  employee_id?: string | number;
  contract_id?: string | number;
  project_id?: string | number;
  status?: string;
  is_confirmed?: string;
  is_paid?: string;
  date_from?: string;         // YYYY-MM-DD
  date_to?: string;           // YYYY-MM-DD
  day_night?: string;
  service_type?: string;
  machine_type?: string;
  tonnage?: string;
  [key: string]: string | number | undefined;  // 支援 filter_xxx 動態 key
}
```

---

## 5. 新增欄位完整步驟

### 5.1 Checklist

新增一個可篩選/排序的列表欄位，需要修改以下位置：

| # | 位置 | 修改內容 | 必要性 |
|---|------|----------|--------|
| 1 | `backend/prisma/schema.prisma` | 在 model 中加入欄位定義 | ✅ 必要 |
| 2 | `backend/prisma/migrations/` | 建立 migration SQL | ✅ 必要 |
| 3 | 後端 Service `columnFilterFields` | 加入欄位 key | ✅ 篩選必要 |
| 4 | 後端 Service `relationFilterConfig` | 如果是關聯欄位，加入配置 | 條件性 |
| 5 | 後端 Service `dateFilterFields` | 如果是日期欄位 | 條件性 |
| 6 | 後端 Service `booleanFilterFields` | 如果是布林欄位 | 條件性 |
| 7 | 後端 Service `numericFilterFields` | 如果是數值欄位 | 條件性 |
| 8 | 後端 Service `findAll` include | 如果是關聯欄位，加入 include | 條件性 |
| 9 | 後端 Service `allowedSort` | 如果需要排序 | 條件性 |
| 10 | 後端 Service `relationSortMap` | 如果是關聯欄位排序 | 條件性 |
| 11 | 前端 `COLUMNS` 陣列 | 加入 `{ key, label, width }` | ✅ 必要 |
| 12 | 前端 `COLUMN_SORT_FIELD` | 加入排序映射 | 條件性 |
| 13 | 前端 `useColumnConfig` 的 `COLUMN_CONFIG_VERSION` | **Bump 版本號** | ✅ 必要 |
| 14 | 前端列表渲染邏輯 | 加入該欄位的值渲染 | ✅ 必要 |
| 15 | 後端 DTO | 如果涉及建立/更新，確認 DTO 有定義 | 條件性 |

### 5.2 Migration 規範

**檔案命名**: `YYYYMMDDHHMMSS_描述/migration.sql`

**PostgreSQL 語法規則**:
- 表名用雙引號包裹，使用實際表名（小寫複數），如 `"work_logs"`
- **禁止**使用 MySQL 反引號
- **禁止**使用 Prisma model 名稱（如 `"WorkLog"`）

**範例**:
```sql
-- 正確
ALTER TABLE "work_logs" ADD COLUMN "new_field" TEXT;

-- 錯誤
ALTER TABLE `work_logs` ADD COLUMN `new_field` TEXT;
ALTER TABLE "WorkLog" ADD COLUMN "new_field" TEXT;
```

**Migration 三重確認**:
1. Prisma schema 有定義
2. Migration SQL 已建立且語法正確
3. 資料庫實際有該欄位

### 5.3 Bump COLUMN_CONFIG_VERSION

**位置**: `frontend/src/hooks/useColumnConfig.ts`

```typescript
// 修改前
const COLUMN_CONFIG_VERSION = 5;

// 修改後（每次新增欄位都 +1）
const COLUMN_CONFIG_VERSION = 6;
```

**不 bump 的後果**: 用戶的 localStorage 保存了舊的欄位配置，新欄位不會出現在列表中，用戶看不到新欄位。

### 5.4 新增關聯欄位範例

假設要新增「項目」欄位（已有 project 關聯）：

**Step 1 - 前端 COLUMNS**:
```typescript
const COLUMNS = [
  // ... existing columns
  { key: 'project', label: '項目', width: 'w-28' },
];
```

**Step 2 - 前端 COLUMN_SORT_FIELD**:
```typescript
const COLUMN_SORT_FIELD: Record<string, string> = {
  // ... existing
  project: 'project',
};
```

**Step 3 - 後端 columnFilterFields**:
```typescript
private readonly columnFilterFields = [
  // ... existing
  'project',
];
```

**Step 4 - 後端 relationFilterConfig**:
```typescript
private readonly relationFilterConfig = {
  // ... existing
  project: { relation: 'project', field: 'name', foreignKey: 'project_id' },
};
```

**Step 5 - 後端 relationSortMap**:
```typescript
const relationSortMap = {
  // ... existing
  project: { project: { name: safeSortOrder } },
};
```

**Step 6 - Bump COLUMN_CONFIG_VERSION**

### 5.5 新增一般文字欄位範例

假設要新增 `remark_type` 欄位：

**Step 1 - Prisma schema**:
```prisma
model WorkLog {
  // ... existing
  remark_type String?
}
```

**Step 2 - Migration**:
```sql
ALTER TABLE "work_logs" ADD COLUMN "remark_type" TEXT;
```

**Step 3 - 前端 COLUMNS + COLUMN_SORT_FIELD**

**Step 4 - 後端 columnFilterFields 加入 `'remark_type'`**

**Step 5 - 後端 allowedSort 加入 `'remark_type'`**

**Step 6 - Bump COLUMN_CONFIG_VERSION**

---

## 6. 頂部篩選 vs 欄頂篩選

| 特性 | 頂部篩選 (Top Filters) | 欄頂篩選 (Column Filters) |
|------|------------------------|---------------------------|
| 位置 | 表格上方的篩選面板 | 欄位標題內的下拉選單 |
| 參數格式 | `client_id=53,54` | `filter_client=["金門建築","明達建築"]` |
| 值類型 | ID（數字） | 顯示值（文字） |
| 選項來源 | 獨立的 reference data API | filter-options API |
| 互相影響 | 頂部篩選影響欄頂選項 | 欄頂篩選互相影響（排除自身） |
| 持久化 | sessionStorage (pageState) | sessionStorage (pageState.columnFilters) |

**聯動規則**:
- 頂部篩選改變 → 欄頂篩選選項會跟著縮小範圍
- 欄頂篩選 A 改變 → 欄頂篩選 B 的選項會跟著縮小範圍
- 欄頂篩選 A 改變 → 欄頂篩選 A 自己的選項不受影響（排除自身）

---

## 7. 排序機制

### 7.1 前端

```typescript
// 點擊欄位標題觸發
const handleSort = (field: string, order: string) => {
  setSortBy(field);
  setSortOrder(order);
  setPage(1);
};
```

### 7.2 後端

**一般欄位排序**:
```typescript
const allowedSort = ['id', 'scheduled_date', 'status', 'machine_type', ...];
// → orderBy = { [sortBy]: safeSortOrder }
```

**關聯欄位排序**:
```typescript
const relationSortMap = {
  publisher: { publisher: { displayName: safeSortOrder } },
  company: { company: { name: safeSortOrder } },
  client: { client: { name: safeSortOrder } },
  // ...
};
// → orderBy = relationSortMap[sortBy]
```

---

## 8. 欄位配置持久化

### 8.1 儲存層級

| 層級 | API 端點 | 說明 |
|------|----------|------|
| 個人偏好 | `PUT /api/column-preferences/:pageKey` | 當前用戶的配置 |
| 全域預設 | `PUT /api/column-preferences/:pageKey/default` | 所有用戶的預設（admin only） |
| 重設 | `DELETE /api/column-preferences/:pageKey` | 刪除個人偏好，回到全域預設 |

### 8.2 配置格式

```typescript
interface ColumnConfig {
  key: string;      // 欄位 key
  label: string;    // 顯示名稱
  visible: boolean; // 是否顯示
  order: number;    // 排序位置
}
```

### 8.3 特殊欄位保護

Key 以 `_` 開頭的欄位（如 `_select`）應排除 columnConfig 過濾，始終保留顯示。

---

## 9. 常見錯誤和避免方法

| 錯誤 | 原因 | 解決方案 |
|------|------|----------|
| 新欄位用戶看不到 | 未 bump COLUMN_CONFIG_VERSION | 每次新增欄位必須 bump |
| 篩選選項不聯動 | 使用 `skipColumnFilters: true` | 改用 `excludeColumnFilter: key` |
| 篩選無效 | 後端 columnFilterFields 沒加入新欄位 | 確認已加入 |
| 關聯欄位篩選報錯 | 未在 relationFilterConfig 配置 | 加入配置 |
| Migration 失敗 | 用了 MySQL 語法或 Prisma model 名 | 用 PostgreSQL 語法 + 實際表名 |
| 排序無效 | 未在 allowedSort 或 relationSortMap 加入 | 確認已加入 |
| 篩選值包含已刪除資料 | buildWorkLogWhere 缺少 deleted_at: null | 確認 where 初始化有此條件 |
| DTO whitelist 過濾欄位 | DTO 缺少欄位定義 | 確認 DTO 有所有需要的欄位 |

---

## 10. API 端點彙整

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/work-logs` | 取得列表資料（帶分頁、排序、篩選） |
| POST | `/api/work-logs/search` | 同上（POST 版本，避免 URL 過長） |
| GET | `/api/work-logs/filter-options/:column` | 取得指定欄位的篩選選項 |
| POST | `/api/work-logs/filter-options/:column` | 同上（POST 版本） |
| GET | `/api/column-preferences/:pageKey` | 取得欄位配置偏好 |
| PUT | `/api/column-preferences/:pageKey` | 儲存個人欄位配置 |
| PUT | `/api/column-preferences/:pageKey/default` | 儲存全域預設配置 |
| DELETE | `/api/column-preferences/:pageKey` | 重設個人配置 |

---

## 11. 檔案位置索引

| 功能 | 檔案路徑 |
|------|----------|
| ColumnFilter 組件 | `frontend/src/components/ColumnFilter.tsx` |
| ColumnCustomizer 組件 | `frontend/src/components/ColumnCustomizer.tsx` |
| DataTable 組件 | `frontend/src/components/DataTable.tsx` |
| InlineEditDataTable 組件 | `frontend/src/components/InlineEditDataTable.tsx` |
| useColumnConfig Hook | `frontend/src/hooks/useColumnConfig.ts` |
| 工作紀錄列表頁 | `frontend/src/app/(main)/work-logs/page.tsx` |
| 工作紀錄 Service | `backend/src/work-logs/work-logs.service.ts` |
| 工作紀錄 Controller | `backend/src/work-logs/work-logs.controller.ts` |
| WorkLogQuery 類型 | `backend/src/common/types.ts` |
| Prisma Schema | `backend/prisma/schema.prisma` |
| Migration 目錄 | `backend/prisma/migrations/` |
| API 定義 | `frontend/src/lib/api.ts` |

---

## 12. 其他列表頁面適用性

本規範同樣適用於以下頁面（使用相同組件架構）：

- 發票列表 (`/invoices`)
- 報價單列表 (`/quotations`)
- 支出列表 (`/expenses`)
- 收款列表 (`/payment-in`)
- 付款列表 (`/payment-out`)
- 員工列表 (`/employees`)
- 計糧列表 (`/payroll`)

各頁面的差異僅在於：
- `COLUMNS` 定義不同
- `columnFilterFields` 不同
- `relationFilterConfig` 不同
- `buildWorkLogWhere` 替換為對應的 `buildXxxWhere`

但核心機制（ColumnFilter 組件、useColumnConfig、filter-options API 模式）完全相同。
