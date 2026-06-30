# 部署與基礎設施文檔

> **重要：所有開發和維護工作必須先閱讀此文件，確認連接正確的資料庫和伺服器。**

## 正式環境資料庫（Production Database）

| 項目 | 值 |
|------|-----|
| 類型 | AWS RDS PostgreSQL |
| Host | `mingtat-erp-db.c5g8w4kck2j1.ap-east-1.rds.amazonaws.com` |
| Port | `5432` |
| Database | `mingtat_erp` |
| User | `mingtat_admin` |
| Password | `MingtatERP2026!` |
| 完整 URL | `postgresql://mingtat_admin:MingtatERP2026!@mingtat-erp-db.c5g8w4kck2j1.ap-east-1.rds.amazonaws.com:5432/mingtat_erp` |

### ⚠️ 注意事項

- **Neon 資料庫已棄用**，不要連接 `neon.tech` 的任何資料庫
- 所有 migration、資料修正、查詢都必須在 RDS 上執行
- 如果在代碼或歷史記錄中看到 Neon 連線字串，**忽略它**

## EC2 伺服器

| 項目 | 值 |
|------|-----|
| IP | `43.199.108.130` |
| User | `ubuntu` |
| SSH Key | `mingtat-erp-key.pem` |
| 工作目錄 | `/opt/mingtat-erp/` |
| 環境變數 | `/opt/mingtat-erp/backend/.env` |

## Docker 部署架構

| 項目 | 值 |
|------|-----|
| 前端容器 | `mingtat-erp-frontend`（service name: `frontend`） |
| 後端容器 | `mingtat-erp-backend`（service name: `backend`） |
| 前端 Image | `ghcr.io/kitahuman/mingtat-erp-frontend:latest` (port 3000) |
| 後端 Image | `ghcr.io/kitahuman/mingtat-erp-backend:latest` (port 3001) |
| Docker Network | `mingtat-network` |
| Volume | `/opt/mingtat-erp/backend/uploads → /app/uploads` |

### Docker Compose 指令

```bash
# 重啟後端
cd /opt/mingtat-erp && docker compose restart backend

# 重啟前端
cd /opt/mingtat-erp && docker compose restart frontend

# 查看後端 log
docker logs mingtat-erp-backend --tail 100

# 查看前端 log
docker logs mingtat-erp-frontend --tail 100
```

## 部署流程（自動）

1. Push 到 `main` branch
2. GitHub Actions 自動觸發：build Docker images → push 到 GHCR → SSH 到 EC2 → `docker compose pull` → `docker compose up -d`
3. 後端啟動時自動執行 `prisma migrate deploy`

### 部署注意事項

- **不要在 EC2 上手動 git pull 或 npm run build**，一切由 GitHub Actions 處理
- **PM2 已廢棄**，不要使用
- Push 前要先在本地跑 TypeScript 編譯檢查（`nest build` / `next build`）
- Nginx 反向代理在宿主機上（不在 Docker 內），SSL 用 Let's Encrypt

## Migration 注意事項

### 遇到 Failed Migration

如果 `prisma migrate deploy` 報錯 `P3009 - found failed migrations`：

```bash
# 1. 先 resolve 失敗的 migration
export DATABASE_URL='postgresql://mingtat_admin:MingtatERP2026!@mingtat-erp-db.c5g8w4kck2j1.ap-east-1.rds.amazonaws.com:5432/mingtat_erp'
npx prisma migrate resolve --rolled-back <migration_name>

# 2. 如果欄位已存在，修改 migration SQL 加 IF NOT EXISTS
ALTER TABLE "table_name" ADD COLUMN IF NOT EXISTS "column_name" ...;

# 3. 重新執行
npx prisma migrate deploy
```

### Migration SQL 規範

- 必須用 PostgreSQL 語法（雙引號），不能用 MySQL 語法（反引號）
- 用實際表名（小寫複數，如 `invoices`），不能用 Prisma model 名（如 `Invoice`）
- ADD COLUMN 建議加 `IF NOT EXISTS` 避免重複執行失敗
- CREATE TABLE 建議加 `IF NOT EXISTS`

## Digital Ocean 伺服器（WhatsApp Bot）

| 項目 | 值 |
|------|-----|
| IP | `147.182.233.182` |
| User | `root` |
| Password | `s01100989` |
| WhatsApp Bot 路徑 | `/root/whatsapp-bot/` |
| 管理工具 | PM2 |
| Webhook Secret | `mingtat-wa-webhook-2026` |
| Order 群組 ID | `85295153909-1626250244@g.us` |

## GitHub

| 項目 | 值 |
|------|-----|
| Repo | `kitahuman/mingtat-erp` |
| PAT Token | `（見 Agent Instruction 或 EC2 環境變數）`（有 workflows 權限） |
| Actions | 用最新版本，避免 Node.js deprecation warning |
