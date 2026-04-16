# 銀行月結單 PDF 格式分析

## 1. HSBC（匯豐銀行）
- **識別特徵**: 頂部有 "HSBC" logo 和 "The Hongkong and Shanghai Banking Corporation Limited"
- **帳號格式**: 585-085947-001
- **欄位**: Date(日期), Details(賬項), Deposit/存入/HKD, Withdrawal/提取/HKD, Balance in HKD/港幣結餘
- **日期格式**: DD-Mon (e.g. "31-Jan", "2-Feb", "5-Feb")
- **金額格式**: 帶逗號分隔千位 (e.g. "30,000.00", "8,292,441.08")
- **交易類型描述**: 
  - 入數: "CHEQUE DEPOSIT MACHINE 入票易" + REF號碼 + 日期
  - 支票: "CHEQUE 312928 支票支出"
  - ATM: "ATM WITHDRAWAL 櫃員機提金提款"
  - 轉帳: "5592-4033-3238-4832 轉賬支出" + N號碼
  - 現金: "CASH 311890 現金提款"
  - 自動轉帳: "HKETOLL (AUTOTOLL) 轉賬支出"
- **參考號**: 支票號碼(CHEQUE xxxxx)、REF號碼(REF:5886 0046)、帳號轉帳號碼
- **摘要**: 最後一頁有 Deposits 存入(次數+金額)、Withdrawals 支出(次數+金額)、Balance 結餘
- **多頁**: 4頁，交易跨頁連續
- **B/F BALANCE**: 第一行是期初餘額 "2026 B/F BALANCE"

## 2. 上海商業銀行 (Shanghai Commercial Bank)
- **識別特徵**: 頂部有 "上海商業銀行" / "SHANGHAI COMMERCIAL BANK", "支票戶口月結單 CHECKING ACCOUNT STATEMENT"
- **帳號格式**: 344-82-07996-2
- **欄位**: DATE(日期), TRANSACTION DETAILS(交易內容), WITHDRAWALS(支出金額), DEPOSITS(存入金額), BALANCE(結餘)
- **日期格式**: DDMMMYY (e.g. "02MAR26", "03MAR26", "28FEB26")
- **金額格式**: 帶逗號分隔千位 (e.g. "127,000.00", "6,787,014.12")
- **交易類型描述**:
  - 轉帳: "TFR WITHDRAWAL 200325 轉帳提取 TFR TO 34482082580"
  - 現金: "CASH WITHDRAWAL 200317 現金提款"
  - 支票: "CLEARING CHEQUE 200331 交換票據"
  - 入數: "CHEQUE DEPOSIT 支票存入"
  - 快速轉帳: "FPS TFR DEPOSIT 轉數快轉入 8282387"
  - 匯入: "I/R CREDIT 匯入匯款入帳 PPCH2603230885"
  - 信用卡: "CREDIT CARD REPAY 信用卡還款 4182110020320007"
- **參考號**: 交易編號(200325, 200331等)、帳號(34482082580)、FPS號碼(8282387)
- **摘要**: 最後一頁有 C/F BALANCE(結餘)、TRANSACTION TOTAL(交易總計: 支出次數/金額, 存入次數/金額)
- **多頁**: 4頁(3頁交易+1頁注意事項)
- **B/F BALANCE**: 第一行是 "28FEB26 B/F BALANCE 承前結餘"

## 3. 中國銀行（香港）(Bank of China Hong Kong) - BIA 商業理財
- **識別特徵**: 頂部有 "中國銀行（香港）" / "BANK OF CHINA (HONG KONG)" logo 和 "BIA 商業理財", "綜合月結單"
- **帳號格式**: 012-738-2-009750-5（儲蓄）, 012-738-2-009752-1（往來）
- **欄位**: 交易日期, 起息/生效日期, 交易摘要, 存入, 提取, 原幣結餘/(結欠)
- **日期格式**: YYYY/MM/DD (e.g. "2026/02/28", "2026/03/31")
- **金額格式**: 帶逗號分隔千位 (e.g. "100.00")
- **交易類型**: 承前結餘, 今期結餘（本樣本帳戶無交易記錄）
- **特點**: 綜合月結單，包含多個帳戶（儲蓄+往來+外幣），每個帳戶有獨立的交易表格
- **摘要**: 財務摘要（上月結餘/當月結餘）、帳戶概覽（多帳戶列表）
- **注意**: 本樣本是空帳戶（餘額 100.00，無交易），實際有交易時格式相同

## 4. OCBC 銀行（華僑銀行）
- **識別特徵**: 頂部有 "OCBC" logo, "月結單 Statement of Account"
- **帳號格式**: 773581-831（整合帳戶）, 773581-051（往來）, 773581（儲蓄）
- **欄位**: DATE, PARTICULARS, WITHDRAWAL, DEPOSIT, BALANCE (DR=DEBIT)
- **日期格式**: DDMMMYY (e.g. "11FEB26", "12FEB26", "02MAR26")
- **金額格式**: 帶逗號分隔千位 (e.g. "2,500.00", "100,000.00")
- **交易類型描述**:
  - 支票: "CHQ NO.001618", "CHQ NO.001619"（支票號碼直接在 PARTICULARS 欄位）
  - 轉入: "INCLEARING RETURN NO.001622 VALUE DATE 02MAR26"
  - 手續費: "CHARGE CQRTN 030326"
  - 轉帳: "TRANSFER-CREDIT HMIT260304116401"
  - 存款: "CHEQUE-DEPOSIT"
- **參考號**: 支票號碼(CHQ NO.001618)、轉帳參考(HMIT260304116401)
- **特點**: 整合帳戶包含多個子帳戶（HKD CURRENT、HKD STATEMENT SAVINGS），每個子帳戶有獨立交易表
- **摘要**: PORTFOLIO SUMMARY（投資組合摘要）、ACCOUNT SUMMARY（帳戶摘要）、TRANSACTION SUMMARY（交易總計）
- **B/F BALANCE**: 第一行是 "B/F BALANCE"

## 格式對比總結

| 銀行 | 日期格式 | 欄位順序 | 支票號碼位置 | 識別關鍵字 |
|------|---------|---------|------------|-----------|
| HSBC | DD-Mon (e.g. 31-Jan) | Date, Details, Deposit, Withdrawal, Balance | CHEQUE xxxxx 在描述中 | "HSBC", "Hongkong and Shanghai Banking" |
| 上海商業銀行 | DDMMMYY (e.g. 02MAR26) | DATE, TRANSACTION DETAILS, WITHDRAWALS, DEPOSITS, BALANCE | CLEARING CHEQUE 200331 在描述中 | "SHANGHAI COMMERCIAL BANK", "支票戶口月結單" |
| 中國銀行 | YYYY/MM/DD (e.g. 2026/03/31) | 交易日期, 起息日期, 交易摘要, 存入, 提取, 結餘 | 無（本樣本無交易） | "中國銀行（香港）", "BIA 商業理財", "綜合月結單" |
| OCBC | DDMMMYY (e.g. 11FEB26) | DATE, PARTICULARS, WITHDRAWAL, DEPOSIT, BALANCE | CHQ NO.001618 在描述中 | "OCBC", "Statement of Account", "月結單" |
