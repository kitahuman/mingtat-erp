# useListPage Hook 使用指南

## 概述

`useListPage` 封裝了列表頁面的通用邏輯，包括：

- 資料獲取與載入狀態
- 分頁控制
- 搜尋（含防抖）
- 篩選器管理
- 錯誤處理

## 基本用法

```tsx
"use client";
import { useListPage } from "@/hooks/useListPage";
import { contractsApi } from "@/lib/api";

export default function ContractsPage() {
  const {
    data,
    total,
    loading,
    error,
    page,
    totalPages,
    setPage,
    goNext,
    goPrev,
    search,
    setSearch,
    filterValues,
    setFilter,
    resetFilters,
    refresh,
  } = useListPage({
    fetchFn: (params) => contractsApi.list(params),
    pageSize: 20,
    filters: [
      { key: "status", initial: "" },
      { key: "client_id", initial: "" },
    ],
  });

  return (
    <div>
      {/* 搜尋框 */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋..."
      />

      {/* 篩選器 */}
      <select
        value={filterValues.status}
        onChange={(e) => setFilter("status", e.target.value)}
      >
        <option value="">全部狀態</option>
        <option value="active">進行中</option>
      </select>

      {/* 資料表格 */}
      {loading ? (
        <p>載入中...</p>
      ) : (
        <table>
          {data.map((item: any) => (
            <tr key={item.id}>
              <td>{item.name}</td>
            </tr>
          ))}
        </table>
      )}

      {/* 分頁 */}
      <div>
        <button onClick={goPrev} disabled={page <= 1}>
          上一頁
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button onClick={goNext} disabled={page >= totalPages}>
          下一頁
        </button>
      </div>
    </div>
  );
}
```

## 與現有 InlineEditDataTable 整合

```tsx
const {
  data,
  total,
  loading,
  page,
  setPage,
  search,
  setSearch,
  filterValues,
  setFilter,
  refresh,
} = useListPage({
  fetchFn: (params) => contractsApi.list(params),
  pageSize: 20,
  filters: [{ key: "status" }, { key: "clientId" }],
});

<InlineEditDataTable
  data={data}
  total={total}
  page={page}
  pageSize={20}
  onPageChange={setPage}
  search={search}
  onSearch={setSearch}
  loading={loading}
  onSave={handleInlineSave}
  onDelete={handleInlineDelete}
  filters={
    <select
      value={filterValues.status}
      onChange={(e) => setFilter("status", e.target.value)}
    >
      <option value="">全部狀態</option>
    </select>
  }
/>;
```

## 重構前後對比

### 重構前（約 30 行 boilerplate）

```tsx
const [data, setData] = useState([]);
const [total, setTotal] = useState(0);
const [page, setPage] = useState(1);
const [search, setSearch] = useState("");
const [loading, setLoading] = useState(true);
const [statusFilter, setStatusFilter] = useState("");

const load = useCallback(async () => {
  setLoading(true);
  try {
    const params = { page, limit: 20, search };
    if (statusFilter) params.status = statusFilter;
    const res = await api.list(params);
    setData(res.data.data);
    setTotal(res.data.total);
  } catch {}
  setLoading(false);
}, [page, search, statusFilter]);

useEffect(() => {
  load();
}, [load]);
```

### 重構後（約 10 行）

```tsx
const {
  data,
  total,
  loading,
  page,
  setPage,
  search,
  setSearch,
  filterValues,
  setFilter,
  refresh,
} = useListPage({
  fetchFn: (params) => api.list(params),
  pageSize: 20,
  filters: [{ key: "status" }],
});
```

## API 參考

| 屬性           | 類型                     | 說明               |
| -------------- | ------------------------ | ------------------ |
| `data`         | `T[]`                    | 當前頁資料         |
| `total`        | `number`                 | 總記錄數           |
| `loading`      | `boolean`                | 載入狀態           |
| `error`        | `string \| null`         | 錯誤訊息           |
| `page`         | `number`                 | 當前頁碼           |
| `totalPages`   | `number`                 | 總頁數             |
| `setPage`      | `(p: number) => void`    | 設定頁碼           |
| `goNext`       | `() => void`             | 下一頁             |
| `goPrev`       | `() => void`             | 上一頁             |
| `search`       | `string`                 | 搜尋關鍵字         |
| `setSearch`    | `(s: string) => void`    | 設定搜尋（含防抖） |
| `filterValues` | `Record<string, string>` | 所有篩選器的值     |
| `setFilter`    | `(key, value) => void`   | 設定篩選器         |
| `resetFilters` | `() => void`             | 重置所有篩選器     |
| `refresh`      | `() => void`             | 手動重新獲取資料   |
