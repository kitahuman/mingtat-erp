# 明達建築有限公司 ERP 系統 — 第一階段

## 系統概述

本系統為明達建築有限公司集團的第一階段 ERP 系統，提供完整的基礎主檔管理功能，涵蓋公司管理、員工管理、車輛管理及機械管理四大核心模組。

## 技術架構

| 層級 | 技術選型 | 說明 |
|------|---------|------|
| 前端 | Next.js 14 + React + TypeScript | 使用 App Router，Tailwind CSS 樣式 |
| 後端 | NestJS + TypeORM | RESTful API，JWT 認證 |
| 資料庫 | PostgreSQL | 關聯式資料庫，完整的實體關係設計 |
| 部署 | Node.js 服務 | 前端 port 3000，後端 port 3001 |

## 功能模組

### 1. 儀表板
- 總覽統計：公司數、員工數、車輛數、機械數
- 到期提醒：員工證照、車輛保險/檢查、機械驗機紙（30天內到期預警）
- 員工職位分佈圖表

### 2. 公司管理
- 新增/編輯/停用公司
- 公司代號（DTC、DCL、CNL、MCL、DTL）
- 公司詳情頁顯示旗下員工、車輛、機械
- 支援搜尋和類型篩選

### 3. 員工管理
- 新增/編輯/停用員工
- 員工資料：姓名、職位（司機/機手/雜工/管理）、聯絡方式
- 證照管理：平安卡、工卡、駕駛執照及到期日追蹤
- 薪資設定：底薪、各種津貼、OT時薪，帶生效日期（新增不覆蓋）
- 員工調動：記錄每次調動的日期和前後公司
- 支援分頁、搜尋、職位篩選、公司篩選

### 4. 車輛管理
- 新增/編輯/停用車輛
- 車輛資料：車牌、車型、噸數、所屬公司
- 更換車牌（保留歷史車牌紀錄）
- 過戶功能（記錄過戶日期和前後公司）
- 保險到期日、檢查日期、牌照到期日追蹤
- 支援分頁、搜尋、車型篩選、公司篩選

### 5. 機械管理
- 新增/編輯/停用機械
- 機械資料：編號（DC01-DC22）、品牌、型號、噸數、序號、所屬公司
- 過戶功能（記錄歷史擁有者）
- 驗機紙到期日追蹤
- 支援分頁、搜尋、類型篩選、公司篩選

### 6. 登入和權限管理
- JWT Token 認證
- 管理員帳號可管理所有資料

## 集團架構（五間公司）

| 代號 | 公司名稱 | 英文名稱 | 職能 |
|------|---------|---------|------|
| DTC | 明達運輸公司 | DTC Transport Co. | 對外承接工程 |
| DCL | 明達建築有限公司 | DCL Construction Ltd. | 承包工程、持有機械 |
| CNL | 卓嵐發展有限公司 | CNL Development Ltd. | 聘請員工 |
| MCL | 明創運輸有限公司 | MCL Transport Ltd. | 持有車輛 |
| DTL | 明達運輸有限公司 | DTL Transport Ltd. | 持有車輛 |

## 初始數據

- **5 間公司**：DTC、DCL、CNL、MCL、DTL
- **32 名員工**：5 管理 + 9 司機 + 8 機手 + 10 雜工（全部隸屬 CNL）
- **27 輛車輛**：MCL 持有 16 輛 + DTL 持有 11 輛
- **22 台機械**：DC01-DC22（全部隸屬 DCL）

## 資料庫設計

### 主要實體表

| 表名 | 說明 |
|------|------|
| users | 系統使用者（登入帳號） |
| companies | 公司主檔 |
| employees | 員工主檔 |
| employee_salary_settings | 員工薪資設定（歷史紀錄） |
| employee_transfers | 員工調動紀錄 |
| vehicles | 車輛主檔 |
| vehicle_plate_history | 車牌變更紀錄 |
| vehicle_transfers | 車輛過戶紀錄 |
| machinery | 機械主檔 |
| machinery_transfers | 機械過戶紀錄 |

## 啟動方式

### 前置條件
- Node.js 22+
- PostgreSQL 14+
- pnpm

### 啟動步驟

```bash
# 1. 啟動 PostgreSQL
sudo service postgresql start

# 2. 啟動後端 (port 3001)
cd /home/ubuntu/mingtat-erp/backend
npx ts-node src/main.ts

# 3. 啟動前端 (port 3000)
cd /home/ubuntu/mingtat-erp/frontend
pnpm start

# 或使用一鍵啟動腳本
bash /home/ubuntu/mingtat-erp/start.sh
```

### 登入資訊
- **帳號**：admin
- **密碼**：admin123

## 目錄結構

```
mingtat-erp/
├── backend/                    # NestJS 後端
│   ├── src/
│   │   ├── auth/              # 認證模組（JWT）
│   │   ├── companies/         # 公司管理模組
│   │   ├── employees/         # 員工管理模組
│   │   ├── vehicles/          # 車輛管理模組
│   │   ├── machinery/         # 機械管理模組
│   │   ├── dashboard/         # 儀表板模組
│   │   ├── seed.ts            # 初始數據匯入
│   │   ├── app.module.ts      # 主模組
│   │   └── main.ts            # 入口
│   └── .env                   # 環境設定
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── login/         # 登入頁
│   │   │   └── (main)/        # 主要頁面群組
│   │   │       ├── dashboard/ # 儀表板
│   │   │       ├── companies/ # 公司管理
│   │   │       ├── employees/ # 員工管理
│   │   │       ├── vehicles/  # 車輛管理
│   │   │       └── machinery/ # 機械管理
│   │   ├── components/        # 共用元件
│   │   └── lib/               # API 客戶端、認證
│   └── next.config.js
├── start.sh                   # 一鍵啟動腳本
└── README.md                  # 本文件
```

## API 端點

### 認證
- `POST /api/auth/login` — 登入
- `GET /api/auth/profile` — 取得個人資料

### 公司
- `GET /api/companies` — 公司列表（支援分頁、搜尋、篩選）
- `GET /api/companies/simple` — 簡易公司列表（下拉選單用）
- `GET /api/companies/:id` — 公司詳情（含關聯實體）
- `POST /api/companies` — 新增公司
- `PATCH /api/companies/:id` — 更新公司

### 員工
- `GET /api/employees` — 員工列表
- `GET /api/employees/:id` — 員工詳情（含薪資、調動紀錄）
- `POST /api/employees` — 新增員工
- `PATCH /api/employees/:id` — 更新員工
- `POST /api/employees/:id/salary` — 新增薪資設定
- `POST /api/employees/:id/transfer` — 員工調動

### 車輛
- `GET /api/vehicles` — 車輛列表
- `GET /api/vehicles/:id` — 車輛詳情（含車牌歷史、過戶紀錄）
- `POST /api/vehicles` — 新增車輛
- `PATCH /api/vehicles/:id` — 更新車輛
- `POST /api/vehicles/:id/change-plate` — 更換車牌
- `POST /api/vehicles/:id/transfer` — 車輛過戶

### 機械
- `GET /api/machinery` — 機械列表
- `GET /api/machinery/:id` — 機械詳情（含過戶紀錄）
- `POST /api/machinery` — 新增機械
- `PATCH /api/machinery/:id` — 更新機械
- `POST /api/machinery/:id/transfer` — 機械過戶

### 儀表板
- `GET /api/dashboard/stats` — 統計數據
