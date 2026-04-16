# 銀行月結單 PDF 格式分析

## 1. HSBC（匯豐銀行）

**識別特徵**：頁頭有 "HSBC" logo 和 "The Hongkong and Shanghai Banking Corporation Limited / 香港上海滙豐銀行有限公司"

**帳戶資訊位置**：右上角表格，包含 Statement date、Account number

**交易表格欄位**：

| 欄位 | 說明 |
|------|------|
| Date 日期 | 格式：D-Mon（如 31-Jan, 2-Feb），同日期多筆交易只在第一筆顯示日期 |
| Details 賬項 | 多行：第一行為交易類型（英文），第二行為中文說明，第三行為參考號或日期 |
| Deposit 存入 HKD | 存入金額，逗號千分位，兩位小數 |
| Withdrawal 提取 HKD | 提取金額，逗號千分位，兩位小數 |
| Balance in HKD 港幣結餘 | 不是每行都有，只在某些交易後顯示 |

**參考號格式**：
- 支票：`CHEQUE 312928`
- 轉賬：`WH T22M242 IP6`、`REF-588C 0208`
- 括號內日期：`(02FEB26)`
- 轉賬參考：`N20492065610(04FEB26)`

**交易類型關鍵字**：CHEQUE DEPOSIT MACHINE、ATM WITHDRAWAL、HKETOLL、TRANSFER、CASH

**尾頁摘要**：Deposits 存入（count + amount）、Withdrawals 支出（count + amount）、Balance 結餘

---

## 2. 上海商業銀行（Shanghai Commercial Bank）

**識別特徵**：頁頭有 "上海商業銀行 SHANGHAI COMMERCIAL BANK" logo，標題 "支票戶口月結單 CHECKING ACCOUNT STATEMENT"

**帳戶資訊位置**：右側，包含 A/C No.、Statement Date（格式：31 MAR 2026）、Page

**交易表格欄位**：

| 欄位 | 說明 |
|------|------|
| 日期 DATE | 格式：DDMMMYY（如 02MAR26, 03MAR26），同日期多筆只顯示一次 |
| 交易內容 TRANSACTION DETAILS | 兩列：英文交易類型 + 6位數字參考號 + 中文說明（如 200325 轉帳提取） |
| 支出金額 WITHDRAWALS | 提取金額 |
| 存入金額 DEPOSITS | 存入金額 |
| 結餘 BALANCE | 每行都有結餘 |

**參考號格式**：6位數字（如 200315、200325、342589），緊接在交易類型後

**交易類型關鍵字**：TFR WITHDRAWAL、CASH WITHDRAWAL、CLEARING CHEQUE、FPS TFR DEPOSIT、CHEQUE DEPOSIT、CREDIT CARD REPAY、I/R CREDIT

**尾頁**：TRANSACTION TOTAL 交易總計（支出總額、存入總額、筆數）

---

## 3. 中國銀行（Bank of China Hong Kong）

**識別特徵**：頁頭有 "中國銀行(香港) BANK OF CHINA (HONG KONG)" logo，標題 "綜合月結單"，右上角有 "BIA 商業理財"

**帳戶資訊位置**：右側，包含 月結單日期（格式：2026/03/31）、頁數

**格式特點**：這份是「綜合月結單」，包含多個帳戶（儲蓄帳戶、往來帳戶）

**交易表格欄位**（往來帳戶部分）：

| 欄位 | 說明 |
|------|------|
| 交易日期 | 格式：YYYY/MM/DD（如 2026/02/28） |
| 起息/生效日期 | 格式：YYYY/MM/DD |
| 交易摘要 | 交易描述（如 承前結餘、今期結餘） |
| 存入 | 存入金額 |
| 提取 | 提取金額 |
| 原幣結餘/(結欠) | 結餘 |

**注意**：這份 BOC 月結單的往來帳戶（012-738-2-009752-1）只有承前結餘和今期結餘，沒有明細交易記錄（帳戶餘額為 100.00，可能是測試帳戶）

---

## 4. OCBC（華僑銀行）

**識別特徵**：頁頭有 "OCBC" logo，標題 "月結單 Statement of Account"

**帳戶資訊位置**：右上角表格，包含 BANK REFERENCE、PAGE、STATEMENT DATE（格式：11MAR2026）、ACCOUNT TYPE、BRANCH

**格式特點**：綜合帳戶，包含多個子帳戶（HKD CURRENT、HKD STATEMENT SAVINGS）

**交易表格欄位**：

| 欄位 | 說明 |
|------|------|
| DATE | 格式：DDMMMYY（如 11FEB26, 12FEB26），同日期多筆只顯示一次 |
| PARTICULARS | 交易描述，可多行（如 CHQ NO.001618、INCLEARING RETURN / NO.001622 / VALUE DATE 02MAR26） |
| WITHDRAWAL | 提取金額 |
| DEPOSIT | 存入金額 |
| BALANCE (DR=DEBIT) | 每行都有結餘，DR 表示透支 |

**參考號格式**：
- 支票：`CHQ NO.001618`（格式 CHQ NO.XXXXXX）
- 轉賬：`TRANSFER-CREDIT HMIT260304116401`
- 費用：`CHARGE CQRTN 030326`

**交易類型關鍵字**：B/F BALANCE、CHQ NO.、INCLEARING RETURN、TRANSFER-CREDIT、TRANSFER-DEBIT、CHEQUE-DEPOSIT、CHARGE、INTEREST PAYMENT-CR、CARRIED FORWARD

---

## 格式對比總結

| 銀行 | 日期格式 | 參考號格式 | Balance 顯示 | 識別關鍵字 |
|------|---------|-----------|-------------|-----------|
| HSBC | D-Mon (2-Feb) | CHEQUE XXXXXX / WH XXXXX / REF-XXXX | 部分行有 | "HSBC" / "Hongkong and Shanghai Banking" |
| 上海商業 | DDMMMYY (02MAR26) | 6位數字 (200315) | 每行都有 | "SHANGHAI COMMERCIAL BANK" / "支票戶口月結單" |
| 中國銀行 | YYYY/MM/DD (2026/03/31) | 無明顯參考號 | 每行都有 | "BANK OF CHINA" / "中國銀行" / "綜合月結單" |
| OCBC | DDMMMYY (11FEB26) | CHQ NO.XXXXXX / HMIT... | 每行都有 | "OCBC" / "月結單 Statement of Account" |
