# 明達建築 ERP 系統 — 功能更新報告

## 提交記錄

**Commit**: `4e4a176` → `main` 分支  
**倉庫**: [kitahuman/mingtat-erp](https://github.com/kitahuman/mingtat-erp)  
**變更**: 26 個檔案，新增 2,146 行，刪除 574 行

---

## 功能一：批量取消確認

### 後端
| 檔案 | 變更 |
|------|------|
| `backend/src/work-logs/work-logs.controller.ts` | 新增 `PATCH /work-logs/bulk-unconfirm` 端點 |
| `backend/src/work-logs/work-logs.service.ts` | 新增 `bulkUnconfirm()` 方法，使用 Prisma `updateMany` 批量將 `is_confirmed` 設為 `false` |

### 前端
| 檔案 | 變更 |
|------|------|
| `frontend/src/app/(main)/work-logs/page.tsx` | 新增「取消確認」按鈕，選取已確認記錄後可批量改回未確認狀態 |
| `frontend/src/lib/api.ts` | 新增 `workLogsApi.bulkUnconfirm()` API 方法 |

---

## 功能二：CSV 匯入功能

### 後端（新增模組）
| 檔案 | 說明 |
|------|------|
| `backend/src/csv-import/csv-import.module.ts` | CSV 匯入 NestJS 模組 |
| `backend/src/csv-import/csv-import.controller.ts` | 三個端點：`GET /template`、`POST /preview`、`POST /execute` |
| `backend/src/csv-import/csv-import.service.ts` | 通用 CSV 匯入服務，支援 8 個模組的欄位定義和匯入邏輯 |

### 支援的模組

| 模組 | 頁面 | CSV 範本欄位 |
|------|------|-------------|
| `employees` | 員工管理 | 員工編號、中文姓名、英文姓名、職位、電話等 |
| `vehicles` | 車輛管理 | 車牌、車型、噸數、品牌、型號等 |
| `machinery` | 機械管理 | 機械編號、類型、品牌、型號、噸數等 |
| `partners` | 合作單位 | 代碼、名稱、類型、聯絡人、電話等 |
| `salary-config` | 員工薪酬 | 員工姓名、日薪、OT時薪等 |
| `rate-cards` | 租賃價目表 | 合作單位、車型、噸數、價格等 |
| `fleet-rate-cards` | 車隊價目表 | 合作單位、車型、噸數、價格等 |
| `subcon-rate-cards` | 街車價目表 | 合作單位、車型、噸數、價格等 |

### 前端組件
| 檔案 | 說明 |
|------|------|
| `frontend/src/components/CsvImportModal.tsx` | 通用 CSV 匯入 Modal，包含三步驟：下載範本 → 上傳 CSV → 預覽確認 |

---

## 功能三：列表欄位自訂

### 新增組件
| 檔案 | 說明 |
|------|------|
| `frontend/src/components/ColumnCustomizer.tsx` | 欄位自訂面板，支援顯示/隱藏、拖動排序 |
| `frontend/src/hooks/useColumnConfig.ts` | 欄位配置 Hook，自動保存到 `localStorage` |
| `frontend/src/components/DataTable.tsx` | 重寫 DataTable，支援欄位寬度拖動調整 |

### 整合頁面
所有管理列表頁面均已整合欄位自訂功能：

- 員工管理（`employees`）
- 車輛管理（`vehicles`）
- 機械管理（`machinery`）
- 合作單位（`partners`）
- 員工薪酬（`salary-config`）
- 租賃價目表（`rate-cards`）
- 車隊價目表（`fleet-rate-cards`）
- 街車價目表（`subcon-rate-cards`）

### 功能特性
- **顯示/隱藏欄位**：勾選框控制每個欄位的可見性
- **拖動排序**：拖動欄位名稱調整左右順序
- **寬度調整**：拖動表頭邊框調整欄位寬度
- **設定保存**：所有設定自動保存到 `localStorage`，下次開啟自動恢復
- **重置功能**：一鍵恢復預設欄位配置

---

## 功能四：列表行內編輯

### 新增組件
| 檔案 | 說明 |
|------|------|
| `frontend/src/components/InlineEditDataTable.tsx` | 通用行內編輯 DataTable 組件 |

### 整合頁面

| 頁面 | 可編輯欄位 |
|------|-----------|
| 員工管理 | 編號、中文姓名、英文姓名、職位、電話 |
| 車輛管理 | 車牌、車型、噸數、品牌、型號、狀態 |
| 機械管理 | 編號、類型、品牌、型號、噸數、狀態 |
| 合作單位 | 代碼、英文代碼、名稱、聯絡人、電話 |

### 功能特性
- 點擊「編輯」按鈕進入行內編輯模式
- 支援 text、number、select、date 四種輸入類型
- 編輯時可「儲存」或「取消」
- 仍可點擊行進入詳情頁（非編輯模式時）

---

## 補充功能：中直OT津貼 + 證書欄位

### Prisma Schema 更新

**EmployeeSalarySetting 模型新增：**
- `ot_mid_shift` (Decimal) — 中直OT時薪
- `mid_shift_ot_allowance` (Decimal) — 中直OT津貼

**Employee 模型新增 16 個證書欄位：**

| 欄位 | 類型 | 說明 |
|------|------|------|
| `site_rigging_a12_cert_no` | String | 地盤索具A12證書編號 |
| `site_rigging_a12_cert_expiry` | DateTime | 地盤索具A12證書到期日 |
| `slinging_signaler_a12s_cert_no` | String | 吊索訊號員A12S證書編號 |
| `slinging_signaler_a12s_cert_expiry` | DateTime | 吊索訊號員A12S證書到期日 |
| `zero_injury_cert_no` | String | 零意外證書編號 |
| `zero_injury_cert_expiry` | DateTime | 零意外證書到期日 |
| `designated_trade_safety_cert_no` | String | 指定行業安全證書編號 |
| `designated_trade_safety_cert_expiry` | DateTime | 指定行業安全證書到期日 |
| `small_loader_cert_expiry` | DateTime | 小型裝載機證書到期日 |
| `safety_supervisor_cert_expiry` | DateTime | 安全督導員證書到期日 |
| `safe_work_procedure_cert_expiry` | DateTime | 安全工作程序證書到期日 |
| `grinding_wheel_cert_expiry` | DateTime | 砂輪證書到期日 |
| `ship_cargo_cert_expiry` | DateTime | 船舶貨物證書到期日 |
| `arc_welding_cert_expiry` | DateTime | 電弧焊接證書到期日 |
| `gas_welding_cert_expiry` | DateTime | 氣焊證書到期日 |
| `clp_safety_cert_expiry` | DateTime | CLP安全證書到期日 |

### 後端邏輯更新
- `salary-config.service.ts`：`numericFields` 新增 `ot_mid_shift`
- `payroll.service.ts`：OT slots 計算新增中直班次支援

### 前端更新
- `salary-config/page.tsx`：列表和表單新增中直OT津貼欄位
- `salary-config/[id]/page.tsx`：詳情頁新增中直OT津貼欄位

---

## 資料庫遷移

已直接對資料庫執行 SQL 新增欄位（不重置現有數據）：

```sql
ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS ot_mid_shift DECIMAL(10,2);
ALTER TABLE employee_salary_settings ADD COLUMN IF NOT EXISTS mid_shift_ot_allowance DECIMAL(10,2);
-- 16 個員工證書欄位已由另一任務直接添加
```

Prisma Client 已重新生成（`npx prisma generate`）。
