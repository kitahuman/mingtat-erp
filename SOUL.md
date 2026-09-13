# Mingtat ERP Agent Soul：Git Push、CI 與部署排障準則

> **目的：** 本文件是 `kitahuman/mingtat-erp` 的持久化操作記憶。任何 agent 在準備推送或核對部署前，必須先閱讀本文件及 [`DEPLOYMENT.md`](DEPLOYMENT.md)。本文件只保存已驗證的方法、順序與排障分流；**不得記錄、輸出、提交或複製 PAT、GHCR token、SSH private key、資料庫密碼或 `.env` 值。**

## 不可違反的部署原則

正式環境只由 GitHub Actions 的 `Docker Build & Deploy to EC2` workflow 部署。Agent **不得**在 EC2 上執行 `git pull`、`npm run build`、`docker compose pull`、`docker compose up`、`restart` 或其他手動部署命令。允許的 EC2 SSH 操作僅限唯讀核對、短暫的隔離 Git 認證橋接，以及 GitHub Actions 已成功後的健康檢查。

部署所依賴的映像由 GitHub Actions 建置並推送至 GHCR；EC2 工作目錄的 Git HEAD 不可用來判斷已部署前端版本。正式版本的權威來源是 `http://127.0.0.1:3000/version.json` 中的 `commit`。

## 已驗證的推送渠道與優先順序

| 優先序 | 渠道 | 已驗證狀態 | 使用規則 |
| --- | --- | --- | --- |
| 1 | Manus GitHub Connector / GitHub CLI integration | Connector 已啟用，可用於讀取 workflow、run 與 job 狀態。 | 每次先確認 connector 狀態與 `gh auth status`。只有在 `gh auth setup-git` 與 `git push --dry-run` 都成功時，才能將它用作 Git transport。不能因為 `gh run list` 成功就假定 Git push 也會成功。 |
| 2 | Sandbox 內既有 Git credential | 未保證持久可用。曾遇到 `GH_TOKEN` API 401 與 HTTPS Git 認證失敗。 | 先做無副作用的 GitHub API read 或 `git push --dry-run`。失敗後不要反覆嘗試、不要把 token 寫入 remote URL、命令列或 repository。 |
| 3 | **EC2 既有 GHCR 登入憑證的隔離 Git fallback** | 已驗證可對 `kitahuman/mingtat-erp` 取得 GitHub API `permissions.push=true`，並成功 fast-forward push。 | 只在渠道 1、2 無法做 Git transport 時使用。必須在 `/tmp` 的全新 Git repo 操作，從 bundle 匯入已驗證 commit；不得修改 `/opt/mingtat-erp` 工作樹。token 只能在短暫 askpass／環境變數中使用，完成後立刻刪除暫存檔與目錄。 |

## 推送前的必經流程

1. **鎖定基線。** 執行 `git fetch origin main`，記錄 `origin/main` SHA、候選 `HEAD` SHA 與候選 parent SHA。候選 commit 必須是當刻 `origin/main` 的直接 descendant；若遠端已變更，先 rebase，絕不 force push。
2. **完整驗證。** 依改動範圍執行必要的 unit/integration tests、typecheck 與 production build。WorkspaceTabs 改動的最少 gate 是：`npm ci --legacy-peer-deps`、`npm run test:workspace:all`、`npm run typecheck`、`npm run build`。遇到 browser 測試 race 時，先以 `--repeat-each` 壓力重跑，再修正測試或產品協議，不能以重試掩蓋。
3. **檢查提交內容。** 執行 `git diff --check`、檢查 `git status --short`、確保所有新增的 production module、測試、設定與 lockfile 都被納入 Git。任何 `WorkspaceTabs.tsx` import 的新模組或 CI 指令引用的 config/test 都必須已 tracked；未追蹤檔是 P1，不能 push。
4. **秘密與差異審查。** 拒絕提交 `.pem`、`.env`、token、private key、Docker auth 或產物目錄。只提交必要源碼、測試、設定與文件。
5. **Push 前再 fetch。** 推送前最後一次 fetch；確認 `origin/main` 沒有在測試後前進。只進行 fast-forward push。

## 隔離 EC2 fallback 的安全協議

當 GitHub Connector / sandbox credential 無法做 Git transport，而 EC2 的 GHCR credential 經 GitHub API 驗證為 repository push 權限時，依下列協議執行：

1. 在 sandbox 以候選分支相對於 `origin/main` 建立 Git bundle，並以 `git bundle verify` 驗證。
2. 將 bundle 與**不含 secret**的短暫 push helper 傳至 EC2 `/tmp`。
3. helper 在 `mktemp` 目錄建立新 Git repo，fetch 當刻 `origin/main`，必須逐一驗證：遠端 SHA 等於預期 base、bundle candidate SHA 等於預期 commit、candidate parent 等於該遠端 SHA。
4. helper 使用只存於記憶體／環境的 askpass credential 對 `HEAD:main` fast-forward push；push 後以 `git ls-remote` 驗證 `main` 等於預期 candidate SHA。
5. 無論成功或失敗，都刪除 `/tmp` bundle、askpass helper、臨時 repository 與含 token 的環境變數。不可顯示 token、base64 Docker auth 值或任何 credential 值。
6. **不可**以 EC2 `/opt/mingtat-erp` 進行 push；該目錄是正式環境工作樹，保持唯讀可將 Git transport 與部署風險完全分離。

## GitHub Actions 與正式環境核對

Push 後，使用 GitHub Connector / `gh run view` 或 GitHub API 按 commit SHA 定位 workflow。只接受以下條件後才判定部署完成：

| 階段 | 成功條件 | 失敗時的分流 |
| --- | --- | --- |
| Changed Paths | 結論成功，路徑分類符合改動。 | 檢查 `dorny/paths-filter`。純 `.md` 文件改動預期不建置 frontend/backend，也不 deploy。 |
| Frontend / backend build | 受影響服務的 build job 成功；不受影響服務為 skipped 是正常。 | 下載失敗 job log，定位特定 step；不可手動在 EC2 build。 |
| Deploy to EC2 | 只有受影響 build 成功後才應成功。 | 若前置 build 失敗而 skipped，代表**尚未部署**；先修 CI、重新驗證、產生最小修正 commit。 |
| 版本 | 前端 `version.json` 的短 SHA 必須等於已部署 commit。 | 若不一致，保留證據並查 workflow / image tag；不可直接重啟容器。 |
| 容器 | `docker compose ps`：backend healthy、frontend running。 | 以唯讀 `docker compose logs --since ...` 擷取錯誤，回到 Actions / source 修正。 |
| API | `GET http://127.0.0.1:3001/api/health` 回傳 `status: ok`（或明確允許的 degraded）。 | `/health` 與 `/api` 是錯誤 probe，回 404 不能當作服務故障；應使用 `/api/health`。 |
| 前端 | `GET http://127.0.0.1:3000/` HTTP 200。 | 收集 frontend logs 與 version.json，再按 workflow/image tag 排查。 |

## 已知問題與排除順序

| 症狀 | 先排除 | 正確處理 |
| --- | --- | --- |
| `could not read Username` / `Invalid username or token` | sandbox Git credential 有效性。 | 不重試同一 token；先測 connector / `gh auth setup-git` + dry-run。若仍無 Git transport，走隔離 EC2 fallback。 |
| GitHub API 401 | token 過期或 session env 覆寫。 | 不印 token；改用已驗證的 connector credential 或 EC2 GHCR fallback API permission test。 |
| GitHub Actions frontend test 僅在 CI 失敗 | Playwright timing / browser dialog race。 | 重跑失敗測試並加 `--repeat-each`；同步等待 dialog 的 accept/dismiss 完成，不能讓前一個 listener 殘留到下一步。 |
| Build job failed，Deploy skipped | 已部署版本不會改變。 | 讀取失敗 job 的明確 step / error context，修最小問題、重跑完整本地 gate、再 push。 |
| EC2 Git HEAD 與 version.json 不同 | 部署模式是 image pull，不是 EC2 git checkout。 | 以 version.json 和 image/container 狀態作為部署真相。 |
| backend 看到 `GET /api` 或 `GET /health` 404 | workflow 或手動 probe path 錯誤。 | 以 `/api/health` 檢查；若 workflow 仍使用 `/api`，另開最小 workflow 修正，不要誤判本次部署失敗。 |

## WorkspaceTabs 特別門檻

涉及 WorkspaceTabs 的變更除了常規 gate 外，必須驗證：使用者最先開啟的頁面是唯一不可關閉的基底頁；其後從 Sidebar 開啟的內部頁面成為可關閉工作頁籤，合計最多 8 個，不得以第二個列表取代基底。2026-09-13 已核准把這個 1+8 規則套用至主 ERP 所有合資格的列表→既存實體詳情流程；建立流程、純報表、列印、下載、inline/modal 操作、`/contracts` redirect、打卡與 upload 流程仍不建立獨立 entity tab。這與列表資料分頁（API page/limit/total、DataTable、頁碼保存）是兩個獨立工作範圍，不得混合擴張。滿額對話框只能提供「取消」與「在新瀏覽器分頁開啟」，不可自動關閉既有 tab。切換頁籤必須保留各 iframe 頁面實例及其搜尋、篩選、表單草稿、展開狀態和 scroll 等頁內狀態；相同 entity 子頁須復用 tab 並保留 query/hash；dirty close / navigation 必須 fail-closed；browser Back/Forward 可恢復；iframe late-ready 不遺失導航；popup blocker 必須提供可理解回饋；隱藏 iframe 的週期性工作必須暫停並在重新啟用時更新。

**完成定義：** 推送 SHA、成功 Actions URL、version.json SHA、容器狀態、`/api/health`、前端 HTTP status 與最近 error-log 結論都已被記錄。任何一項缺失時，狀態是「尚未完成」，不是「大致成功」。
