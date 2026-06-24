# 工作紀錄列表頁面完整技術規範

> **版本基準**: commit `958ba67e` (2026-06-24)
> **檔案**: `frontend/src/app/(main)/work-logs/page.tsx`
> **適用範圍**: 工作紀錄列表頁面的所有功能，包括篩選、排序、inline edit、批量操作、選取、滾動、分頁

---

## 目錄

1. [架構總覽](#1-架構總覽)
2. [頁面 Layout 與滾動機制](#2-頁面-layout-與滾動機制)
3. [頂部篩選面板](#3-頂部篩選面板)
4. [欄頂篩選 (ColumnFilter)](#4-欄頂篩選-columnfilter)
5. [篩選聯動規則](#5-篩選聯動規則)
6. [排序機制](#6-排序機制)
7. [Inline Edit 機制](#7-inline-edit-機制)
8. [行鎖定 (Row Locking)](#8-行鎖定-row-locking)
9. [選取與跨頁累積](#9-選取與跨頁累積)
10. [批量操作](#10-批量操作)
11. [新增行](#11-新增行)
12. [單行操作](#12-單行操作)
13. [重設篩選](#13-重設篩選)
14. [欄位配置持久化](#14-欄位配置持久化)
15. [狀態持久化 (sessionStorage)](#15-狀態持久化-sessionstorage)
16. [分頁](#16-分頁)
17. [後端 API 規格](#17-後端-api-規格)
18. [新增欄位完整 Checklist](#18-新增欄位完整-checklist)
19. [常見錯誤和避免方法](#19-常見錯誤和避免方法)
20. [檔案位置索引](#20-檔案位置索引)

---

## 1. 架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│ Page Root: div.flex.h-[100dvh].flex-col.overflow-hidden          │
├─────────────────────────────────────────────────────────────────┤
│ Page Header (shrink-0)                                           │
│   - 標題 + 總筆數                                                │
│   - 未儲存提示 + 儲存/放棄按鈕                                    │
│   - 已選提示 + 批量操作按鈕                                       │
│   - ColumnCustomizer + ExportButton                              │
├─────────────────────────────────────────────────────────────────┤
│ Alert Banners (shrink-0, conditional)                            │
│   - 未確認客戶 banner (黃色)                                      │
│   - 新建地點 banner (黃色)                                        │
├─────────────────────────────────────────────────────────────────┤
│ Top Filter Panel (shrink-0, overflow-x-auto)                     │
│   - 發佈人、狀態、公司、客戶、報價單、合約、員工、機號             │
│   - 日期從、日期至、月份快捷鍵（本月/上月/上上月）                 │
│   - 重設篩選按鈕                                                  │
├─────────────────────────────────────────────────────────────────┤
│ Table Container (min-h-0 flex-1 overflow-auto)                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ <table> minWidth: 2800px                                 │   │
│   │   <thead> sticky top-0 z-20                              │   │
│   │     #(sticky left-0) | ☐(sticky left-10) | ID | ...cols  │   │
│   │     ... | 操作(sticky right-0)                            │   │
│   │   <tbody>                                                │   │
│   │     [new row] (green bg, if active)                      │   │
│   │     [data rows] (inline editable)                        │   │
│   └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│ Pagination Footer (shrink-0)                                     │
│   - 手機版: 簡化分頁                                              │
│   - 桌面版: 每頁筆數 + 分頁按鈕 + 儲存按鈕                       │
└─────────────────────────────────────────────────────────────────┘
```

**資料流**:
```
用戶操作 → 更新 state (via saveState) → buildListParams() → API call → rows 更新 → 渲染
```

---

## 2. 頁面 Layout 與滾動機制

### 2.1 根容器

```tsx
<div className="flex h-[100dvh] flex-col overflow-hidden bg-gray-50 -m-4 sm:-m-6">
```

- `h-[100dvh]`: 佔滿整個視窗高度（dynamic viewport height，適配手機瀏覽器）
- `flex flex-col`: 垂直排列子元素
- `overflow-hidden`: 根容器不滾動，滾動只發生在表格容器內

### 2.2 表格容器

```tsx
<div className="min-h-0 flex-1 overflow-auto bg-white">
  <table className="border-collapse text-xs" style={{ minWidth: '2800px' }}>
```

- `min-h-0 flex-1`: flex item 佔滿剩餘空間，min-h-0 允許收縮
- `overflow-auto`: 水平和垂直滾動都在此容器內
- `minWidth: 2800px`: 表格最小寬度，確保所有欄位有足夠空間，超出時水平滾動

### 2.3 Sticky 欄位

| 位置 | 元素 | CSS | z-index |
|------|------|-----|---------|
| 左 1 | 行號 (#) | `sticky left-0` | thead: z-30, tbody: z-10 |
| 左 2 | Checkbox (☐) | `sticky left-10` (40px) | thead: z-30, tbody: z-10 |
| 右 | 操作按鈕 | `sticky right-0` | thead: z-30, tbody: z-10 |
| 上 | 表頭 (thead) | `sticky top-0` | z-20 |

**z-index 層級**:
- z-30: 表頭的 sticky 欄位（左上角和右上角交叉區域）
- z-20: 表頭整體
- z-10: 表體的 sticky 欄位

### 2.4 行號欄寬度

- `#` 欄: `w-10` (40px)
- Checkbox 欄: `w-8` (32px)
- ID 欄: `w-20` (80px)
- 操作欄: `w-28` (112px)

---

## 3. 頂部篩選面板

### 3.1 容器結構

```tsx
<div className="bg-white border-b border-gray-200 shrink-0 overflow-x-auto">
  <div className="flex gap-2 items-end px-6 py-3" style={{ minWidth: 'max-content' }}>
```

- `shrink-0`: 不被壓縮
- `overflow-x-auto`: 篩選器太多時水平滾動
- `minWidth: 'max-content'`: 內容不換行

### 3.2 頂部篩選器列表

| 篩選器 | 組件 | 寬度 | 參數名 |
|--------|------|------|--------|
| 發佈人 | MultiSearchableSelect | w-32 | publisher_id |
| 狀態 | MultiSearchableSelect | w-28 | status |
| 公司 | MultiSearchableSelect | w-32 | company_id |
| 客戶公司 | MultiSearchableSelect | w-40 | client_id |
| 報價單 | MultiSearchableSelect | w-36 | quotation_id |
| 合約 | MultiSearchableSelect | w-36 | contract_id |
| 員工 | MultiSearchableSelect | w-36 | employee_id / fleet_driver_id |
| 機號 | input (text) | w-24 | equipment_number |
| 日期從 | DateInput | w-32 | date_from |
| 日期至 | DateInput | w-32 | date_to |

### 3.3 MultiSearchableSelect 下拉行為

**定位**:
```typescript
position: 'fixed',
top: rect.bottom + 2,
left: rect.left,
width: Math.max(rect.width, 180),  // 最小寬度 180px
zIndex: 9999,
```

**渲染方式**: `createPortal(dropdown, document.body)` — 避免被父容器 overflow 裁切

**滾動**: `max-h-52` (208px) + `overflow-y-auto`

**功能**:
- 搜尋框（自動 focus，用 `preventScroll: true`）
- 全選 / 清除按鈕
- 選項列表（checkbox 多選）
- 點擊外部關閉
- 滾動/resize 時自動重新定位

### 3.4 月份快捷鍵

```typescript
const MONTH_SHORTCUTS = [
  { label: '本月', monthOffset: 0 },
  { label: '上月', monthOffset: -1 },
  { label: '上上月', monthOffset: -2 },
];
```

點擊後計算該月的 dateFrom 和 dateTo 並設定。

---

## 4. 欄頂篩選 (ColumnFilter)

### 4.1 組件位置

`frontend/src/components/ColumnFilter.tsx`

### 4.2 Props 介面

```typescript
interface ColumnFilterProps {
  columnKey: string;                    // 欄位 key
  data: any[];                          // 當前頁面資料（client-side fallback）
  activeFilters: Record<string, Set<string>>;  // 所有欄位的當前篩選狀態
  onFilterChange: (columnKey: string, selectedValues: Set<string> | null) => void;
  renderValue?: (value: any, row: any) => string;  // 自定義顯示值
  serverSide?: boolean;                 // 是否從後端取選項
  onFetchOptions?: (columnKey: string) => Promise<string[]>;  // 取選項的函數
  optionRender?: (value: string) => string;  // 選項顯示轉換
  displayToRawMap?: Record<string, string>;  // 顯示值 → 原始值映射
}
```

### 4.3 下拉 UI 規格

| 屬性 | 值 |
|------|-----|
| 寬度 | 固定 240px |
| 最小寬度 | min-w-[200px] |
| 最大寬度 | max-w-[280px] |
| 選項行高 | 32px (FILTER_OPTION_ROW_HEIGHT) |
| 列表最大高度 | 288px (FILTER_LIST_MAX_HEIGHT) |
| 虛擬滾動 overscan | 8 行 (FILTER_LIST_OVERSCAN) |
| 定位方式 | `position: fixed` via `createPortal(dropdown, document.body)` |
| z-index | 99999 |
| 開啟方向 | 自動判斷：下方空間不足時向上展開 |

### 4.4 篩選圖標

```tsx
<button className={`ml-1 p-0.5 rounded hover:bg-gray-200 ${isFiltered ? 'text-primary-600' : 'text-gray-400'}`}>
  <svg className="w-3.5 h-3.5" ...> {/* 漏斗圖標 */} </svg>
</button>
```

- 未篩選: `text-gray-400`（灰色）
- 已篩選: `text-primary-600`（藍色）

### 4.5 選項載入流程

1. 用戶點擊篩選圖標 → `isOpen = true`
2. `useEffect` 觸發 → 呼叫 `loadServerOptions()`
3. `loadServerOptions` 呼叫 `onFetchOptionsRef.current(columnKey)`
4. 前端 `onFetchOptions` 呼叫 `workLogsApi.filterOptions(key, buildListParams({}, { excludeColumnFilter: key }))`
5. 後端回傳該欄位的所有唯一值（已根據其他篩選條件過濾）
6. 設定 `serverOptions` → 渲染選項列表

### 4.6 選取邏輯

**初始狀態**: 無篩選（`activeFilters[columnKey]` 為 undefined）→ 所有選項顯示為已勾選

**篩選狀態表示**:
- `null` = 全選（清除篩選）
- `Set<string>` = 只選中 Set 內的值
- 空 `Set` = 全部取消選取

**搜尋時的特殊行為**:
- 搜尋啟用且無篩選 → 所有項目顯示為未勾選（方便用戶挑選）
- 點擊「選擇搜尋結果」→ 只選中搜尋到的項目

### 4.7 虛擬滾動實作

```typescript
const virtualList = useMemo(() => {
  const totalRows = filteredValues.length;
  const totalHeight = totalRows * FILTER_OPTION_ROW_HEIGHT;  // 32px per row
  const viewportHeight = Math.min(totalHeight, FILTER_LIST_MAX_HEIGHT);  // max 288px
  const startIndex = Math.max(0, Math.floor(scrollTop / FILTER_OPTION_ROW_HEIGHT) - FILTER_LIST_OVERSCAN);
  const visibleRowCount = Math.ceil(viewportHeight / FILTER_OPTION_ROW_HEIGHT) + FILTER_LIST_OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleRowCount);
  return { totalHeight, viewportHeight, items: [...] };
}, [filteredValues, scrollTop]);
```

每個選項用 `position: absolute` + `top: index * 32px` 定位。

---

## 5. 篩選聯動規則

### 5.1 buildListParams 函數

```typescript
const buildListParams = useCallback(
  (overrides = {}, { skipColumnFilters = false, excludeColumnFilter } = {}) => {
    const params = { sortBy, sortOrder, ...overrides };
    // 加入頂部篩選條件（publisher_id, status, company_id, client_id, etc.）
    // ...
    if (!skipColumnFilters) {
      for (const [col, vals] of Object.entries(columnFilters)) {
        if (col === excludeColumnFilter) continue;  // 排除自身
        if (Array.isArray(vals) && vals.length > 0) {
          params[`filter_${col}`] = JSON.stringify(vals);
        }
      }
    }
    return params;
  },
  [sortBy, sortOrder, filterPublisher, ..., columnFilters],
);
```

### 5.2 聯動行為

| 場景 | 行為 |
|------|------|
| 頂部篩選改變 | 欄頂篩選選項跟著縮小（因為 buildListParams 包含頂部篩選） |
| 欄頂篩選 A 改變 | 欄頂篩選 B 的選項跟著縮小（因為 excludeColumnFilter 只排除自身） |
| 欄頂篩選 A 改變 | 欄頂篩選 A 自己的選項不受影響（被 excludeColumnFilter 排除） |

### 5.3 後端處理

```typescript
// work-logs.service.ts
async getFilterOptions(column: string, query: WorkLogQuery) {
  const where = this.buildWorkLogWhere(query, column);  // 第二個參數排除目標欄位
  // 查詢該欄位的 distinct 值
}
```

`buildWorkLogWhere(query, excludeColumn)`:
- 套用所有 `filter_xxx` 條件
- 跳過 `filter_{excludeColumn}` 條件
- 套用所有頂部篩選條件（date_from, date_to, client_id 等）

---

## 6. 排序機制

### 6.1 前端

```typescript
const handleSort = (field: string, order: "ASC" | "DESC") => {
  // 如果有未儲存修改，提示確認
  if (hasDirty && !confirm("有未儲存的修改，切換排序將會丟失。確定要繼續嗎？")) return;
  if (hasDirty) { unlockDirtyRows(); setDirtyRows(new Map()); }
  setSortBy(field);
  setSortOrder(order);
  setPage(1);
};
```

**排序圖標**:
- 未啟用: `▲▼`（灰色 `text-gray-300`）
- 啟用 ASC: `▲`（藍色 `text-blue-600`）
- 啟用 DESC: `▼`（藍色 `text-blue-600`）
- 啟用時欄位背景: `bg-blue-50 text-blue-700`

### 6.2 COLUMN_SORT_FIELD 映射

```typescript
const COLUMN_SORT_FIELD: Record<string, string> = {
  publisher: 'publisher',
  status: 'status',
  scheduled_date: 'scheduled_date',
  service_type: 'service_type',
  company: 'company',
  client: 'client',
  // ... 所有可排序欄位
};
```

### 6.3 後端排序

**一般欄位**: `orderBy = { [sortBy]: safeSortOrder }`

**關聯欄位**:
```typescript
const relationSortMap = {
  publisher: { publisher: { displayName: safeSortOrder } },
  company: { company: { name: safeSortOrder } },
  client: { client: { name: safeSortOrder } },
  quotation: { quotation: { quotation_no: safeSortOrder } },
  contract: { contract: { contract_no: safeSortOrder } },
  employee: { employee: { name: safeSortOrder } },
};
```

---

## 7. Inline Edit 機制

### 7.1 EditableCell 組件

**位置**: `frontend/src/app/(main)/work-logs/EditableCell.tsx`

**支援類型**:

| CellType | 說明 | 互動方式 |
|----------|------|----------|
| `text` | 文字輸入 | 點擊進入編輯，點擊外部結束 |
| `number` | 數字輸入 | 同上 |
| `date` | 日期輸入 | DateInput 組件 |
| `time` | 時間輸入 | input type="time" |
| `select` | 下拉選擇 | SearchableSelect 組件 |
| `combobox` | 可搜尋下拉 | Combobox 組件 |
| `combobox_create` | 可搜尋+可建立新選項 | Combobox + 自動建立 field_option |
| `checkbox` | 勾選框 | 直接切換 |
| `readonly` | 唯讀顯示 | 不可編輯 |

**視覺提示**:
- 未修改: 正常顯示
- 已修改 (dirty): `ring-2 ring-amber-400`（琥珀色邊框）

### 7.2 Dirty Tracking

```typescript
const [dirtyRows, setDirtyRows] = useState<Map<number, Record<string, any>>>(new Map());
```

- `dirtyRows`: Map<行ID, {修改的欄位: 新值}>
- 只存儲修改過的欄位，不存整行
- 修改值等於原始值時自動移除（不標記為 dirty）

### 7.3 setCellValue 流程

1. 檢查行是否被其他用戶鎖定 → 如果是，alert 並 return
2. 如果該行還沒有 dirty 記錄 → 呼叫 `lockRows([rowId])` 鎖定
3. 如果鎖定失敗（衝突）→ alert 並 return
4. 比較新值與原始值 → 相同則移除 dirty，不同則記錄
5. 特殊處理：
   - `client_id` 改變 → 同時清空 `quotation_id` 和 `contract_id`
   - `employee_id` 以 `part_` 開頭 → 同時設定 `client_id`

### 7.4 儲存流程 (handleSaveAll)

1. 遍歷 `dirtyRows`，組裝 payload
2. 處理 `employee_id` 前綴（`emp_` / `fleet_` / `part_`）
3. 呼叫 `workLogsApi.bulkSave(changes)`
4. 部分成功：只移除成功的 dirty 記錄，保留失敗的
5. 全部成功：清空所有 dirty，解鎖所有行
6. 重新載入資料

### 7.5 放棄修改 (handleDiscardChanges)

1. confirm 確認
2. `unlockDirtyRows()` 解鎖所有 dirty 行
3. `setDirtyRows(new Map())` 清空 dirty 記錄

### 7.6 未儲存警告

以下操作會觸發 confirm 警告：
- 切換排序
- 切換分頁
- 切換每頁筆數
- 重設篩選
- 瀏覽器關閉/離開（beforeunload）

---

## 8. 行鎖定 (Row Locking)

### 8.1 機制

使用 WebSocket (`useWorkLogSocket`) 實現即時行鎖定：

```typescript
const { locks: rowLocks, lockRows, unlockRows } = useWorkLogSocket({
  onRowsUpdated: handleRowsUpdated,
});
```

- `rowLocks`: `Map<number, WorkLogLockInfo>` — 所有行的鎖定狀態
- `lockRows(ids)`: 嘗試鎖定指定行，回傳 `{ ok, conflicts }`
- `unlockRows(ids)`: 解鎖指定行

### 8.2 鎖定狀態判斷

```typescript
const getRowLock = (rowId) => rowLocks.get(Number(rowId)) || null;
const isRowLockedByOther = (rowId) => {
  const lock = getRowLock(rowId);
  return !!lock && Number(lock.locked_by.id) !== Number(user?.id);
};
```

### 8.3 鎖定的視覺效果

- 被其他用戶鎖定的行: `bg-gray-100 text-gray-500`
- ID 欄下方顯示: `鎖定：{用戶名}`（10px 字體）
- Checkbox 禁用: `cursor-not-allowed opacity-50`

### 8.4 WebSocket 連接

```typescript
const socket = io(getSocketBaseUrl(), {
  path: '/ws/work-logs',
  // ...
});
```

---

## 9. 選取與跨頁累積

### 9.1 狀態結構

```typescript
const [selected, setSelected] = useState<Set<number>>(new Set());           // 已選 ID 集合
const [selectedWorkLogs, setSelectedWorkLogs] = useState<Map<number, any>>(new Map());  // 已選行的完整資料
```

### 9.2 跨頁累積機制

- `selected` 和 `selectedWorkLogs` 不會在換頁時清空
- 換頁後，新頁面的行如果 ID 在 `selected` 中，checkbox 仍然顯示為已選
- `selectedWorkLogs` 用於批量操作時取得完整行資料（即使該行不在當前頁面）

**同步機制**（useEffect）:
```typescript
useEffect(() => {
  // 當 rows 更新時，同步 selectedWorkLogs 中已選行的最新資料
  if (selected.size === 0 || rows.length === 0) return;
  setSelectedWorkLogs((prev) => {
    const next = new Map(prev);
    rows.forEach((row) => {
      const id = Number(row.id);
      if (selected.has(id) && next.get(id) !== row) {
        next.set(id, row);
      }
    });
    return next;
  });
}, [rows, selected]);
```

### 9.3 單行選取

```typescript
const toggleSelect = (row, checked) => {
  const id = Number(row.id);
  if (checked && isRowLockedByOther(id)) return;  // 被鎖定的行不能選取
  setSelected((prev) => { /* add or remove id */ });
  setSelectedWorkLogs((prev) => { /* add or remove row */ });
};
```

### 9.4 全選（當前頁面）

```typescript
const toggleSelectAll = (checked) => {
  const currentPageRows = rows.filter((row) => !isRowLockedByOther(Number(row.id)));
  // 只影響當前頁面的行，不清除其他頁面的選取
  setSelected((prev) => {
    const next = new Set(prev);
    currentPageRows.forEach((row) => {
      if (checked) next.add(id); else next.delete(id);
    });
    return next;
  });
};
```

### 9.5 清除選取

```typescript
const clearSelection = () => {
  setSelected(new Set());
  setSelectedWorkLogs(new Map());
};
```

---

## 10. 批量操作

### 10.1 操作列表

| 按鈕 | 功能 | 條件 |
|------|------|------|
| 批量編輯 | 開啟 BatchEditDialog | 所有選取行未被其他用戶鎖定 |
| 批量確認 | 設定 is_confirmed = true | 同上 |
| 取消確認 | 設定 is_confirmed = false | 同上 + confirm 確認 |
| 批量刪除 | 軟刪除選取行 | confirm 確認 |
| 加入發票 | 連結到現有/新建發票 | — |
| 清除選取 | 清空選取狀態 | — |

### 10.2 BatchEditDialog

**位置**: `frontend/src/app/(main)/work-logs/BatchEditDialog.tsx`

**可批量編輯的欄位** (BATCH_FIELDS):
- 狀態、約定日期、服務類型、公司、客戶公司、報價單、合約、客戶合約
- 員工、機種、機號、噸數、日夜班
- 起點、起點時間、終點、終點時間
- 數量、工資單位、OT數量、OT單位、中直
- 商品數量、商品名稱、商品單位
- 入帳票編號、單號、已確認、已付款、備註

**UI 規格**:
- Modal: `max-w-2xl`, `max-h-[85vh]`
- 內部滾動區域
- 底部顯示已選記錄預覽表格

### 10.3 批量操作鎖定流程

1. `getEditableSelectedIds()` — 過濾掉被其他用戶鎖定的行
2. 如果有被鎖定的行 → alert 並 return
3. `lockRows(editableIds)` — 嘗試鎖定所有選取行
4. 如果有衝突 → alert 並 return
5. 執行操作
6. `unlockRows(ids)` — 解鎖
7. `clearSelection()` + `fetchLogs()` — 清除選取並重新載入

---

## 11. 新增行

### 11.1 handleAddNew

```typescript
const handleAddNew = () => {
  setNewRow({
    status: 'editing',
    publisher_id: user?.id,
    scheduled_date: new Date().toISOString().split('T')[0],
  });
};
```

### 11.2 新行 UI

- 背景: `bg-green-50 border-b-2 border-green-300`
- 行號顯示: ★
- ID 顯示: NEW
- 操作: 💾 儲存 + ✕ 取消

### 11.3 handleSaveNew

1. 處理 employee_id 前綴
2. 呼叫 `workLogsApi.create(payload)`
3. 成功: `setNewRow(null)` + `fetchLogs()`
4. 失敗: alert 錯誤訊息

### 11.4 setNewRowField 特殊邏輯

- `employee_id` 以 `part_` 開頭 → 同時設定 `client_id`
- `client_id` 改變 → 清空 `quotation_id` 和 `contract_id`

---

## 12. 單行操作

### 12.1 操作按鈕（sticky right 欄）

| 按鈕 | 功能 | 樣式 |
|------|------|------|
| 附件 | 開啟附件管理 modal | `bg-blue-50 text-blue-600` |
| 📋 | 複製行 | `bg-green-50 text-green-600` |
| 🗑️ | 刪除行 | `bg-red-50 text-red-600` |
| ✓✓ | 核對面板 | 動態顏色（見下方） |

### 12.2 核對按鈕顏色

| 狀態 | 樣式 |
|------|------|
| 展開中 | `bg-indigo-600 text-white` |
| 全部已確認 | `bg-green-100 text-green-700` |
| 部分審核/有拒絕 | `bg-amber-100 text-amber-700` |
| 未審核 | `bg-indigo-50 text-indigo-600` |

### 12.3 刪除流程

1. 檢查是否被其他用戶鎖定
2. confirm 確認
3. `lockRows([id])` 鎖定
4. `workLogsApi.remove(id)` 刪除
5. 從 dirtyRows 移除
6. `fetchLogs()` 重新載入
7. `unlockRows([id])` 解鎖

### 12.4 複製流程

```typescript
const handleDuplicate = async (id) => {
  await workLogsApi.duplicate(id);
  await fetchLogs();
};
```

---

## 13. 重設篩選

### 13.1 resetFilters 函數

```typescript
const resetFilters = () => {
  if (hasDirty && !confirm('有未儲存的修改，重設篩選將會丟失。確定要繼續嗎？')) return;
  unlockDirtyRows();
  setDirtyRows(new Map());
  setFilterPublisher([]);
  setFilterStatus([]);
  setFilterCompany([]);
  setFilterClient([]);
  setFilterQuotation([]);
  setFilterContract([]);
  setFilterEmployee([]);
  setFilterEquipment('');
  setFilterDateFrom('');
  setFilterDateTo('');
  setColumnFilters({});
  setSortBy('created_at');
  setSortOrder('DESC');
  setPage(1);
};
```

### 13.2 重設按鈕

```tsx
<button
  onClick={resetFilters}
  disabled={!hasFilters}
  className="px-3 py-1 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed self-end whitespace-nowrap"
>
  重設篩選
</button>
```

- 位置: 頂部篩選面板最右側
- 禁用條件: 沒有任何篩選啟用時

### 13.3 hasFilters 判斷

```typescript
const hasFilters = !!(
  filterPublisher.length || filterStatus.length || filterCompany.length ||
  filterClient.length || filterQuotation.length || filterContract.length ||
  filterEmployee.length || filterEquipment ||
  filterDateFrom || filterDateTo ||
  Object.keys(columnFilters).length
);
```

---

## 14. 欄位配置持久化

### 14.1 useColumnConfig Hook

**位置**: `frontend/src/hooks/useColumnConfig.ts`

**版本控制**: `COLUMN_CONFIG_VERSION = 5`

當版本號增加時，所有用戶的 localStorage 配置會被重置。

### 14.2 儲存層級

| 層級 | API 端點 | 說明 |
|------|----------|------|
| 個人偏好 | `PUT /api/column-preferences/:pageKey` | 當前用戶的配置 |
| 全域預設 | `PUT /api/column-preferences/:pageKey/default` | 所有用戶的預設（admin only） |
| 重設 | `DELETE /api/column-preferences/:pageKey` | 刪除個人偏好，回到全域預設 |

### 14.3 配置格式

```typescript
interface ColumnConfig {
  key: string;      // 欄位 key
  label: string;    // 顯示名稱
  visible: boolean; // 是否顯示
  order: number;    // 排序位置
}
```

### 14.4 特殊欄位保護

Key 以 `_` 開頭的欄位（如 `_select`）排除 columnConfig 過濾，始終保留顯示。

### 14.5 ColumnCustomizer 組件

**位置**: `frontend/src/components/ColumnCustomizer.tsx`

**UI**:
- 固定寬度 288px
- 支援拖拉排序
- 顯示/隱藏切換
- 儲存個人 / 儲存全域 / 重設

---

## 15. 狀態持久化 (sessionStorage)

### 15.1 usePageState Hook

**位置**: `frontend/src/hooks/usePageState.ts`

**儲存 key**: `pageState:{pathname}`

**持久化的狀態**:
```typescript
{
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string,
  filterPublisher: [],
  filterStatus: [],
  filterCompany: [],
  filterClient: [],
  filterQuotation: [],
  filterContract: [],
  filterEmployee: [],
  filterEquipment: string,
  filterDateFrom: string,
  filterDateTo: string,
  columnFilters: Record<string, string[]>,
}
```

### 15.2 行為

- 頁面載入時從 sessionStorage 恢復狀態
- 每次 state 變更時自動儲存
- 頁面卸載前儲存 scrollPosition
- `clearState()` 可清除所有儲存的狀態

---

## 16. 分頁

### 16.1 每頁筆數選項

```typescript
const LIMIT_OPTIONS = [25, 50, 100];
```

### 16.2 桌面版分頁 UI

- 左側: 儲存按鈕（如有 dirty）+ 每頁筆數選擇 + 顯示範圍
- 右側: « ‹上一頁 [1][2][3][4][5] 下一頁› »
- 最多顯示 5 個頁碼按鈕，智能計算顯示範圍

### 16.3 手機版分頁 UI

- 簡化版: « ‹ [1][2][3] › » + 頁碼/總頁數

### 16.4 換頁警告

```typescript
const changePage = (newPage) => {
  if (hasDirty) {
    if (!confirm('有未儲存的修改，切換分頁將會丟失。確定要繼續嗎？')) return;
    unlockDirtyRows();
    setDirtyRows(new Map());
  }
  setPage(newPage);
};
```

---

## 17. 後端 API 規格

### 17.1 API 端點

| 方法 | 路徑 | 用途 |
|------|------|------|
| GET | `/api/work-logs` | 取得列表資料（帶分頁、排序、篩選） |
| POST | `/api/work-logs/search` | 同上（POST 版本） |
| GET/POST | `/api/work-logs/filter-options/:column` | 取得指定欄位的篩選選項 |
| POST | `/api/work-logs` | 建立新記錄 |
| PATCH | `/api/work-logs/:id` | 更新單筆記錄 |
| POST | `/api/work-logs/bulk-save` | 批量儲存修改 |
| POST | `/api/work-logs/bulk-delete` | 批量刪除 |
| POST | `/api/work-logs/bulk-confirm` | 批量確認 |
| POST | `/api/work-logs/bulk-unconfirm` | 批量取消確認 |
| POST | `/api/work-logs/duplicate/:id` | 複製記錄 |
| DELETE | `/api/work-logs/:id` | 刪除單筆記錄 |
| GET | `/api/column-preferences/:pageKey` | 取得欄位配置 |
| PUT | `/api/column-preferences/:pageKey` | 儲存個人配置 |
| PUT | `/api/column-preferences/:pageKey/default` | 儲存全域預設 |
| DELETE | `/api/column-preferences/:pageKey` | 重設配置 |

### 17.2 columnFilterFields

後端支援的欄頂篩選欄位列表（`work-logs.service.ts`）:

```typescript
private readonly columnFilterFields = [
  'status', 'scheduled_date', 'service_type', 'machine_type',
  'equipment_number', 'tonnage', 'day_night', 'start_location',
  'start_time', 'end_location', 'end_time', 'quantity', 'unit',
  'ot_quantity', 'ot_unit', 'work_order_no', 'remarks',
  'work_content', 'is_mid_shift', 'is_confirmed', 'is_paid',
  'source', 'receipt_no', 'client_contract_no',
  'goods_quantity', 'work_log_product_name', 'work_log_product_unit',
  // 關聯欄位
  'publisher', 'company', 'client', 'quotation', 'contract', 'employee',
  'fleet_driver', 'equipment',
];
```

### 17.3 relationFilterConfig

關聯欄位的篩選配置:

```typescript
private readonly relationFilterConfig = {
  publisher: { relation: 'publisher', field: 'displayName', foreignKey: 'publisher_id' },
  company: { relation: 'company', field: 'name', foreignKey: 'company_id' },
  client: { relation: 'client', field: 'name', foreignKey: 'client_id' },
  quotation: { relation: 'quotation', field: 'quotation_no', foreignKey: 'quotation_id' },
  contract: { relation: 'contract', field: 'contract_no', foreignKey: 'contract_id' },
  employee: { relation: 'employee', field: 'name', foreignKey: 'employee_id' },
  fleet_driver: { relation: 'fleetDriver', field: 'name', foreignKey: 'work_log_fleet_driver_id' },
  equipment: { relation: 'equipment', field: 'equipment_number', foreignKey: 'equipment_id' },
};
```

### 17.4 applyColumnFilters 邏輯

```typescript
private applyColumnFilters(where: any, query: WorkLogQuery, excludeColumn?: string) {
  for (const field of this.columnFilterFields) {
    if (field === excludeColumn) continue;
    const filterKey = `filter_${field}`;
    const rawValue = query[filterKey];
    if (!rawValue) continue;
    const values: string[] = JSON.parse(rawValue);
    if (values.length === 0) continue;

    // 判斷欄位類型並套用對應的 where 條件
    if (this.relationFilterConfig[field]) {
      // 關聯欄位: JOIN 查詢
    } else if (field === 'scheduled_date') {
      // 日期欄位: 轉為日期範圍
    } else if (['is_mid_shift', 'is_confirmed', 'is_paid'].includes(field)) {
      // 布林欄位: 轉為 true/false
    } else if (['quantity', 'ot_quantity', 'goods_quantity'].includes(field)) {
      // 數值欄位: 轉為數字
    } else {
      // 一般文字欄位: in 查詢
    }
  }
}
```

### 17.5 getFilterOptions 回傳格式

```typescript
// GET /api/work-logs/filter-options/machine_type?date_from=2026-05-01&date_to=2026-05-31&client_id=53
// Response: ["挖掘機", "吊車", "夾車", "拖頭", "泥頭車"]
```

回傳的是字串陣列，已按中文排序。包含 `(空白)` 選項（如果有 null 值）。

---

## 18. 新增欄位完整 Checklist

### 18.1 資料庫層

- [ ] **Prisma schema** 加入欄位定義（`backend/prisma/schema.prisma`）
- [ ] **Migration SQL** 建立欄位（必須用 PostgreSQL 語法，表名用小寫複數如 `"work_logs"`）
- [ ] 確認 migration 可以正常執行（`npx prisma migrate deploy`）
- [ ] 如果是關聯欄位，確認外鍵和索引

### 18.2 後端層

- [ ] **DTO** 加入欄位定義（確保 ValidationPipe whitelist 不會過濾）
- [ ] **Service findAll** 的 select/include 加入新欄位
- [ ] **columnFilterFields** 加入新欄位名
- [ ] 如果是關聯欄位: **relationFilterConfig** 加入配置
- [ ] **allowedSort** 或 **relationSortMap** 加入排序支援
- [ ] 確認 **buildWorkLogWhere** 能正確處理新欄位的篩選

### 18.3 前端層

- [ ] **COLUMNS** 陣列加入新欄位定義（key, label, width）
- [ ] **COLUMN_SORT_FIELD** 加入映射
- [ ] **colKeyToField** 加入映射（如果 key 和 field 不同）
- [ ] **renderCell** 加入新欄位的渲染邏輯
- [ ] **renderNewCell** 加入新行的編輯邏輯
- [ ] 如果需要批量編輯: **BatchEditDialog BATCH_FIELDS** 加入

### 18.4 版本控制

- [ ] **Bump COLUMN_CONFIG_VERSION**（`frontend/src/hooks/useColumnConfig.ts`）

### 18.5 Migration SQL 範例

```sql
-- ✅ 正確: PostgreSQL 語法 + 實際表名
ALTER TABLE "work_logs" ADD COLUMN "project_name" TEXT;

-- ❌ 錯誤: MySQL 語法
ALTER TABLE `work_logs` ADD COLUMN `project_name` TEXT;

-- ❌ 錯誤: Prisma model 名
ALTER TABLE "WorkLog" ADD COLUMN "project_name" TEXT;
```

### 18.6 新增關聯欄位完整範例

假設要新增 `project` 關聯欄位:

**Step 1 - Prisma schema**:
```prisma
model WorkLog {
  project_id  Int?
  project     Project? @relation(fields: [project_id], references: [id])
}
```

**Step 2 - Migration**:
```sql
ALTER TABLE "work_logs" ADD COLUMN "project_id" INTEGER;
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL;
CREATE INDEX "work_logs_project_id_idx" ON "work_logs"("project_id");
```

**Step 3 - 前端 COLUMNS + COLUMN_SORT_FIELD + colKeyToField**

**Step 4 - 後端 columnFilterFields 加入 `'project'`**

**Step 5 - 後端 relationFilterConfig**:
```typescript
project: { relation: 'project', field: 'name', foreignKey: 'project_id' },
```

**Step 6 - 後端 relationSortMap**:
```typescript
project: { project: { name: safeSortOrder } },
```

**Step 7 - Bump COLUMN_CONFIG_VERSION**

---

## 19. 常見錯誤和避免方法

| 錯誤 | 原因 | 解決方案 |
|------|------|----------|
| 新欄位用戶看不到 | 未 bump COLUMN_CONFIG_VERSION | 每次新增欄位必須 bump |
| 篩選選項不聯動 | 使用 `skipColumnFilters: true` | 改用 `excludeColumnFilter: key` |
| 篩選無效 | 後端 columnFilterFields 沒加入新欄位 | 確認已加入 |
| 關聯欄位篩選報錯 | 未在 relationFilterConfig 配置 | 加入配置 |
| Migration 失敗 | 用了 MySQL 語法或 Prisma model 名 | 用 PostgreSQL 語法 + 實際表名（小寫複數） |
| 排序無效 | 未在 allowedSort 或 relationSortMap 加入 | 確認已加入 |
| 篩選值包含已刪除資料 | buildWorkLogWhere 缺少 deleted_at: null | 確認 where 初始化有此條件 |
| DTO whitelist 過濾欄位 | DTO 缺少欄位定義 | 確認 DTO 有所有需要的欄位 |
| Inline edit 無法儲存 | employee_id 前綴未處理 | handleSaveAll 中處理 emp_/fleet_/part_ 前綴 |
| 選取跨頁丟失 | selected 在換頁時被清空 | 確保 setSelected 只 add/delete 當前頁面的行 |
| 鎖定衝突 | 未先 lockRows 就修改 | 所有修改操作前必須先 lockRows |
| Portal 下拉被裁切 | 未用 createPortal | 下拉選單必須 Portal 到 document.body |
| 搜尋框 focus 導致滾動 | 用了 autoFocus | 用 `setTimeout(() => ref.focus({ preventScroll: true }), 0)` |

---

## 20. 檔案位置索引

| 功能 | 檔案路徑 |
|------|----------|
| 工作紀錄列表頁（主頁面） | `frontend/src/app/(main)/work-logs/page.tsx` |
| ColumnFilter 組件 | `frontend/src/components/ColumnFilter.tsx` |
| ColumnCustomizer 組件 | `frontend/src/components/ColumnCustomizer.tsx` |
| EditableCell 組件 | `frontend/src/app/(main)/work-logs/EditableCell.tsx` |
| BatchEditDialog 組件 | `frontend/src/app/(main)/work-logs/BatchEditDialog.tsx` |
| MultiSearchableSelect 組件 | `frontend/src/app/(main)/work-logs/MultiSearchableSelect.tsx` |
| useColumnConfig Hook | `frontend/src/hooks/useColumnConfig.ts` |
| usePageState Hook | `frontend/src/hooks/usePageState.ts` |
| useWorkLogSocket Hook | `frontend/src/hooks/useWorkLogSocket.ts` |
| 工作紀錄 Service | `backend/src/work-logs/work-logs.service.ts` |
| 工作紀錄 Controller | `backend/src/work-logs/work-logs.controller.ts` |
| WorkLogQuery 類型 | `backend/src/common/types.ts` |
| Prisma Schema | `backend/prisma/schema.prisma` |
| Migrations | `backend/prisma/migrations/` |

---

## 附錄: 行背景顏色優先級

| 優先級 | 條件 | 顏色 |
|--------|------|------|
| 1 | 被其他用戶鎖定 | `bg-gray-100` |
| 2 | 已選取 | `bg-blue-50` |
| 3 | 有未儲存修改 (dirty) | `bg-amber-50` |
| 4 | 有未確認客戶 | `bg-amber-50` |
| 5 | 正常 | `bg-white` + `hover:bg-blue-100` |
