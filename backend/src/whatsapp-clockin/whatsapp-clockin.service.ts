import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { createOpenAIClient } from '../common/openai-client';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ClockInPayload {
  chatId: string;
  sender: string;
  text: string;
  groupName?: string;
  messageId?: number; // 如果從 processWebhookMessage 呼叫，帶入已存的 message id
  remoteMessageId?: string; // WhatsApp 原始訊息 ID（用於去重）
  timestamp?: string | number | Date; // 訊息原始時間
}

/** AI 解析後的單筆報工資料 */
interface ParsedClockInEntry {
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 日期結束（日期範圍時使用）YYYY-MM-DD */
  date_end?: string;
  /** 員工姓名（中文） */
  name: string;
  /** 機械編號或車牌 */
  equipment_no: string;
  /** 客戶/公司名稱 */
  company: string;
  /** 合約號碼 */
  contract_no: string;
  /** 起點/工作地點 */
  start_location: string;
  /** 終點 */
  end_location: string;
  /** 工作內容 */
  work_content: string;
  /** 開始時間 HH:MM */
  start_time: string;
  /** 結束時間 HH:MM */
  end_time: string;
  /** 日/夜 */
  day_night: string;
  /** 天數或車數 */
  quantity: number;
  /** 單位：天/晚/車 */
  unit: string;
  /** OT 小時數 */
  ot_quantity: number;
  /** OT 單位 */
  ot_unit: string;
  /** 是否中直 */
  is_mid_shift: boolean;
  /** 商品名稱 */
  product_name: string;
  /** 備註（工作內容 + 額外備註） */
  remarks: string;
  /** 是否為報工訊息 */
  is_clock_in: boolean;
}

export interface ParsedClockIn {
  is_clock_in: boolean;
  entries: ParsedClockInEntry[];
  raw_text: string;
}

// ══════════════════════════════════════════════════════════════
// 報工群組對應
// ══════════════════════════════════════════════════════════════

const CLOCKIN_GROUP_MAP: Record<string, { department: string; service_type: string }> = {
  '120363278016234111@g.us': { department: '工程部', service_type: '工程' },
  '120363277125015302@g.us': { department: '運輸部', service_type: '運輸' },
  '120363262093688968@g.us': { department: '機械部', service_type: '機械' },
};

const CLOCKIN_GROUP_IDS = Object.keys(CLOCKIN_GROUP_MAP);

@Injectable()
export class WhatsappClockinService {
  private readonly logger = new Logger(WhatsappClockinService.name);
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = createOpenAIClient();
  }

  // ────────────────────────────────────────────────────────────
  // 主入口
  // ────────────────────────────────────────────────────────────

  async processClockIn(payload: ClockInPayload): Promise<{
    success: boolean;
    workLogIds?: number[];
    parsed?: ParsedClockIn;
    error?: string;
  }> {
    const { chatId, sender, text, groupName, messageId, remoteMessageId, timestamp } = payload;

    // 0. 去重檢查：如果 Bot 傳來了 WhatsApp 原始訊息 ID，先查是否已處理過
    if (remoteMessageId) {
      const existing = await this.prisma.verificationWaMessage.findFirst({
        where: { wa_msg_remote_id: remoteMessageId },
      });
      if (existing) {
        this.logger.warn(`Duplicate clockin webhook detected (remote_id=${remoteMessageId}), skipping`);
        return { success: false, error: 'duplicate_message' };
      }
    }

    // 1. 群組檢查
    const groupInfo = CLOCKIN_GROUP_MAP[chatId];
    if (!groupInfo) {
      this.logger.warn(`Rejected clockin from non-clockin group: ${chatId}`);
      return { success: false, error: 'Group not in clockin whitelist' };
    }

    // 2. 如果沒有 messageId，儲存原始訊息
    let waMessageId = messageId;
    if (!waMessageId) {
      try {
        const waMessage = await this.prisma.verificationWaMessage.create({
          data: {
            wa_msg_remote_id: remoteMessageId || null,
            wa_msg_group_id: chatId,
            wa_msg_group_name: groupName || groupInfo.department,
            wa_msg_sender_name: sender.split('@')[0],
            wa_msg_timestamp: timestamp ? new Date(timestamp) : new Date(),
            wa_msg_body: text,
            wa_msg_type: 'text',
            wa_msg_is_forwarded: false,
            wa_msg_has_media: false,
            wa_msg_ai_classified: 'clockin',
            wa_msg_processed: false,
          },
        });
        waMessageId = waMessage.id;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to save raw message: ${errMsg}`);
      }
    }

    // 3. 過濾非文字訊息
    if (!text || text.trim() === '' || text.startsWith('[非文字訊息')) {
      return { success: false, error: 'Non-text message, skipped' };
    }

    // 3.5 獲取訊息時間戳：資料庫欄位存 UTC DateTime，remarks 顯示香港時間
    let whatsappReportedAt: Date | null = null;
    let msgTimeStr = '';
    if (timestamp) {
      whatsappReportedAt = new Date(timestamp);
    } else if (waMessageId) {
      const msg = await this.prisma.verificationWaMessage.findUnique({
        where: { id: waMessageId },
        select: { wa_msg_timestamp: true },
      });
      if (msg?.wa_msg_timestamp) whatsappReportedAt = msg.wa_msg_timestamp;
    }
    if (!whatsappReportedAt || Number.isNaN(whatsappReportedAt.getTime())) {
      whatsappReportedAt = new Date();
    }
    msgTimeStr = whatsappReportedAt.toLocaleString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour12: false }).replace(/\//g, '-');

    try {
      // 4. 載入 ERP 參考資料
      const [employees, machinery, vehicles, partners, contracts] = await Promise.all([
        this.prisma.employee.findMany({
          where: { status: 'active' },
          select: { id: true, nickname: true, name_zh: true, name_en: true },
        }),
        this.prisma.machinery.findMany({
          select: { id: true, machine_code: true, brand: true, model: true, machine_type: true, tonnage: true },
        }),
        this.prisma.vehicle.findMany({
          select: { id: true, plate_number: true, machine_type: true, tonnage: true },
        }),
        this.prisma.partner.findMany({
          where: { partner_type: 'client' },
          select: { id: true, name: true, name_en: true },
        }),
        this.prisma.contract.findMany({
          select: { id: true, contract_no: true, contract_name: true },
        }),
      ]);

      // 也載入 EmployeeNickname
      const employeeNicknames = await this.prisma.employeeNickname.findMany({
        select: { emp_nickname_employee_id: true, emp_nickname_value: true },
      });

      // 5. 建立參考資料字串
      const employeeRef = employees.map(e =>
        `ID:${e.id} 花名:${e.nickname || ''} 中文:${e.name_zh || ''}`
      ).join('\n');

      const partnerRef = partners.map(p =>
        `名稱:${p.name || ''} 英文:${p.name_en || ''}`
      ).join('\n');

      const contractRef = contracts.map(c =>
        `合約號:${c.contract_no || ''} 名稱:${c.contract_name || ''}`
      ).join('\n');

      // 6. AI 解析
      const parsed = await this.parseClockInWithAI(
        text,
        groupInfo.service_type,
        { employeeRef, partnerRef, contractRef },
      );

      if (!parsed || !parsed.is_clock_in || parsed.entries.length === 0) {
        // 更新訊息狀態
        if (waMessageId) {
          await this.prisma.verificationWaMessage.update({
            where: { id: waMessageId },
            data: { wa_msg_processed: true, wa_msg_ai_classified: 'clockin_skipped' },
          });
        }
        return { success: false, error: 'Not a valid clock-in message', parsed: parsed || undefined };
      }

      // 7. 為每個解析結果建立 work_log
      const workLogIds: number[] = [];

      for (const entry of parsed.entries) {
        // 展開日期範圍
        const dates = this.expandDateRange(entry.date, entry.date_end);

        for (const scheduledDate of dates) {
          // 員工匹配
          const matchedEmployee = this.matchEmployee(entry.name, employees, employeeNicknames);

          // 客戶匹配
          const matchedClient = this.matchPartner(entry.company, partners);

          // 合約匹配
          const matchedContract = this.matchContract(entry.contract_no, contracts);

          // 設備匹配
          const equipmentMatch = this.matchEquipment(entry.equipment_no, machinery, vehicles);

          // 建立 work_log
          const workLog = await this.prisma.workLog.create({
            data: {
              status: 'editing',
              source: 'whatsapp_clockin',
              service_type: groupInfo.service_type,
              scheduled_date: scheduledDate,
              wl_whatsapp_reported_at: whatsappReportedAt,
              employee_id: matchedEmployee?.id || null,
              equipment_number: entry.equipment_no || null,
              machine_type: equipmentMatch?.type || null,
              equipment_source: equipmentMatch?.source || null,
              tonnage: equipmentMatch?.tonnage || null,
              client_id: matchedClient?.id || null,
              contract_id: matchedContract?.id || null,
              client_contract_no: entry.contract_no || null,
              unverified_client_name: entry.company || null,
              day_night: entry.day_night || null,
              start_location: entry.start_location || null,
              end_location: entry.end_location || null,
              start_time: entry.start_time || null,
              end_time: entry.end_time || null,
              quantity: entry.quantity || null,
              unit: entry.unit || null,
              ot_quantity: entry.ot_quantity > 0 ? entry.ot_quantity : null,
              ot_unit: entry.ot_quantity > 0 ? (entry.ot_unit || '小時') : null,
              is_mid_shift: entry.is_mid_shift || false,
              work_content: entry.work_content || null,
              work_log_product_name: entry.product_name || null,
              remarks: `[WhatsApp 打卡]\n群組: ${groupName || groupInfo.department}\n日期時間: ${msgTimeStr}\n原始訊息: ${text}`,
              ai_parsed_data: {
                ...entry,
                raw_name: entry.name,
                raw_text: text,
                department: groupInfo.department,
                service_type: groupInfo.service_type,
                group_id: chatId,
                sender,
                employee_matched: !!matchedEmployee,
              } as object,
            },
          });

          workLogIds.push(workLog.id);
          this.logger.log(
            `Created WorkLog #${workLog.id} from clockin: ${entry.name} @ ${scheduledDate.toISOString().slice(0, 10)} [${groupInfo.department}]`,
          );
        }
      }

      // 8. 更新訊息狀態
      if (waMessageId) {
        await this.prisma.verificationWaMessage.update({
          where: { id: waMessageId },
          data: {
            wa_msg_processed: true,
            wa_msg_ai_classified: 'clockin',
            wa_msg_ai_confidence: 0.9,
          },
        });
      }

      return { success: true, workLogIds, parsed };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error processing clock-in: ${errMsg}`, errStack);
      return { success: false, error: errMsg };
    }
  }

  // ────────────────────────────────────────────────────────────
  // 確認地點 API（供 controller 呼叫）
  // ────────────────────────────────────────────────────────────

  async confirmLocation(workLogId: number): Promise<{ success: boolean }> {
    await this.prisma.workLog.update({
      where: { id: workLogId },
      data: { is_location_new: false },
    });
    return { success: true };
  }

  // ────────────────────────────────────────────────────────────
  // AI 解析（核心 Prompt）
  // ────────────────────────────────────────────────────────────

  private async parseClockInWithAI(
    text: string,
    serviceType: string,
    refs: {
      employeeRef: string;
      partnerRef: string;
      contractRef: string;
    },
  ): Promise<ParsedClockIn | null> {
    const now = new Date();
    const hkNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = hkNow.toISOString().slice(0, 10);

    const systemPrompt = `你是香港建築運輸公司「明達建築」的 WhatsApp 報工（打卡）訊息解析助手。
你要從員工發送的報工訊息中提取結構化數據。

## 當前部門：${serviceType}

## 三個部門的報工格式

### 工程部（service_type: '工程'）
標準格式包含：日期、姓名、公司名稱、合約號碼、工作性質、工作地點、工作時間
簡短格式：姓名/日期/公司/工作描述/時間（可能缺少標籤）

範例1（標準）：
日期：13-04-2026（夜更）
姓名：黃文麟
公司名稱：明達
合約號碼：T23w021
工作性質：换花泥跟機
工作地點：三跑
工作時間：23:00-07:00
→ date:"2026-04-13", name:"黃文麟", company:"明達", contract_no:"T23W021", work_content:"换花泥跟機", start_location:"三跑", start_time:"23:00", end_time:"07:00", day_night:"夜"

範例2（標準）：
日期：14-04-2026
姓名：李敏區
公司名稱：明達
合約號碼：明達
工作性質：上午跟平水，下午落石矢
工作地點：莲蔴坑，潭尾
工作時間：08:00-18：00
→ date:"2026-04-14", name:"李敏區", company:"明達", contract_no:"", work_content:"上午跟平水，下午落石矢", start_location:"莲蔴坑，潭尾", start_time:"08:00", end_time:"18:00", day_night:"日"
注意：合約號碼寫「明達」不是合約號，是公司名，contract_no 留空

範例3（簡短）：
洪
13-4-2026
明達
金門3802租夾車三跑東邊禁區網回沙
08：00一18：00
→ date:"2026-04-13", name:"洪", company:"金門", contract_no:"3802", work_content:"租夾車三跑東邊禁區網回沙", start_location:"三跑東邊禁區", start_time:"08:00", end_time:"18:00", day_night:"日"

範例4（簡短）：
洪
11-4-2026
明達
力哥架步吊櫃去坪輋2個
XR662
08：00一18：00
→ date:"2026-04-11", name:"洪", company:"力哥", contract_no:"", work_content:"架步吊櫃去坪輋2個", equipment_no:"XR662", start_time:"08:00", end_time:"18:00", day_night:"日"
注意：「力哥架步清場」→ 客戶: 力哥, 工作內容: 架步清場（力哥是客戶不是合約）

### 機械部（service_type: '機械'）
包含：日期、姓名、機械編號、公司名稱、合約號碼、工作地點、工作內容、工作時間

範例1：
日期：14-4-2026
姓名：蘇金平
機械編號：DC08
公司名稱：金門
合約號碼 ：3802
工作地點：三跑東面
工作內容：勾坑 回填
工作時間：08:00 -18:00
→ date:"2026-04-14", name:"蘇金平", equipment_no:"DC08", company:"金門", contract_no:"3802", start_location:"三跑東面", work_content:"勾坑 回填", start_time:"08:00", end_time:"18:00", day_night:"日"

範例2：
日期 : 4-14-2026
姓名：陳廣平
機械編號：DC10
公司名稱：明逹
合約號碼 ：
工作地點:蓮蔴坑
工作內容： 整理樹路
工作時間：08一 17
→ date:"2026-04-14", name:"陳廣平", equipment_no:"DC10", company:"明達", contract_no:"", start_location:"蓮蔴坑", work_content:"整理樹路", start_time:"08:00", end_time:"17:00", day_night:"日"
注意：日期 4-14-2026 月在前（M-D-YYYY）；「明逹」=「明達」；「08一17」= 08:00-17:00

範例3（日期範圍 + 夜班）：
日期14-15-4-2026（ 夜班）
姓名：蘇金平
機械編號：DC11
公司名稱：明達
合約號碼：T23W021
工作地點： 北跑
工作內容：換花泥
工作時間：23:00～06:00
→ date:"2026-04-14", name:"蘇金平", equipment_no:"DC11", company:"明達", contract_no:"T23W021", start_location:"北跑", work_content:"換花泥", start_time:"23:00", end_time:"06:00", day_night:"夜"
注意：14-15-4-2026 = 夜班日期範圍，只取第一天（夜班開始日）作為 date，不要輸出 date_end，只建一筆 work_log

範例4（無標籤簡短格式）：
14-4‐2026
 :石坤泉
公司：金门
机编：DC7
合約：3802南区
地點：三跑東面
工作時閒：8.00一18:00
工作范围：落石矢及回填坑
中直/OT
→ date:"2026-04-14", name:"石坤泉", equipment_no:"DC07", company:"金門", contract_no:"3802", start_location:"三跑東面", work_content:"落石矢及回填坑", start_time:"08:00", end_time:"18:00", day_night:"日", is_mid_shift:true, remarks:"中直/OT 南区"
注意：「金门」=「金門」；「DC7」→「DC07」；「3802南区」→ contract_no:"3802", 南区是備註；「8.00」=「08:00」；「中直/OT」→ is_mid_shift:true

範例5（時間含頂替資訊）：
日期 : 13-4-2026
姓名：陳圖光
機械編號：DC15
公司名稱：金門
合約號碼 ：3802
工作地點：三跑,3區
工作內容： 勾坑
工作時間：08:00 -18:00-頂，啊強
→ date:"2026-04-13", name:"陳圖光", equipment_no:"DC15", company:"金門", contract_no:"3802", start_location:"三跑,3區", work_content:"勾坑", start_time:"08:00", end_time:"18:00", day_night:"日", remarks:"頂，啊強"
注意：「08:00 -18:00-頂，啊強」→ 時間 08:00-18:00，「頂」= 頂替（備註），「啊強」= 頂替的人

### 運輸部（service_type: '運輸'）
包含：日期、車牌、公司、地點、時間、車數、姓名

範例1：
日期：14-4-2026（夜更）
車牌：WC987
公司：明達T23W021
地點：東邊存倉-北跑重鋪花泥
時間：2300-0600
車數：3車出3車入
姓名：蘇啟泰
→ date:"2026-04-14", name:"蘇啟泰", equipment_no:"WC987", company:"明達", contract_no:"T23W021", start_location:"東邊存倉", end_location:"北跑", work_content:"重鋪花泥", start_time:"23:00", end_time:"06:00", day_night:"夜", quantity:6, unit:"車"
注意：「明達T23W021」→ company:"明達", contract_no:"T23W021"；「3車出3車入」→ 3+3=6車

範例2：
日期：2-4-2026（日更）
車牌：JR981
公司：榮興 
合約 : PA13114
地 點:東面機場路至稔灣
時間：共4車
姓名 :盧光耀
→ date:"2026-04-02", name:"盧光耀", equipment_no:"JR981", company:"榮興", contract_no:"PA13114", start_location:"東面機場路", end_location:"稔灣", start_time:"", end_time:"", day_night:"日", quantity:4, unit:"車"
注意：時間欄寫「共4車」→ 沒有具體時間，quantity:4, unit:"車"

範例3：
日期：11-04-2026 （日更）
車牌：WY8724
公司：金門3802
地點：三跑主島,禁區內運。
時間：08:00-1800
姓名 ：盧光耀
→ date:"2026-04-11", name:"盧光耀", equipment_no:"WY8724", company:"金門", contract_no:"3802", start_location:"三跑主島", work_content:"禁區內運", start_time:"08:00", end_time:"18:00", day_night:"日", quantity:1, unit:"天"
注意：沒寫車數，只有時間 → quantity:1, unit:"天"

範例4：
日期：14-4-2026（日更）
車牌：MC26OO
公司：磐石
地點；小蠔灣濾水廠-TM38
時間：0800-1800
車數：2車
姓名：王益隆
→ date:"2026-04-14", name:"王益隆", equipment_no:"MC2600", company:"磐石", contract_no:"", start_location:"小蠔灣濾水廠", end_location:"TM38", start_time:"08:00", end_time:"18:00", day_night:"日", quantity:2, unit:"車"
注意：「MC26OO」→ 「MC2600」（O是0）；「地點；」用了全形分號

範例5（單行格式）：
日期：14-4-2026（日更)  姓名： 吳子旋 車牌：ZY 4778公司 : 明達 合約：T23W021 地點 : 東邊存倉位去屯門38 車數：共1車
→ date:"2026-04-14", name:"吳子旋", equipment_no:"ZY4778", company:"明達", contract_no:"T23W021", start_location:"東邊存倉位", end_location:"屯門38", start_time:"", end_time:"", day_night:"日", quantity:1, unit:"車"

範例6：
日期：13-4-2026（日更）
車牌：TF3306
公司：明達
地點；蓮麻坑-內運
時間：0800-1800
車數：25車
姓名：吳偉泰
→ date:"2026-04-13", name:"吳偉泰", equipment_no:"TF3306", company:"明達", contract_no:"", start_location:"蓮麻坑", work_content:"內運", start_time:"08:00", end_time:"18:00", day_night:"日", quantity:25, unit:"車"

範例7（租車一天）：
日期：13-4-2026（日更）
車牌：Y亅6383
公司：明達
地點；连麻坤一內运
車數：租車一天
姓名：冯回生
→ date:"2026-04-13", name:"馮回生", equipment_no:"YT6383", company:"明達", contract_no:"", start_location:"蓮麻坤", work_content:"內遁", start_time:"", end_time:"", day_night:"日", quantity:1, unit:"天"
注意：「Y亅6383」→ 「YT6383」（久是T）；「连麻坤」=「蓮麻坤」；「租車一天」→ quantity:1, unit:"天"

範例8（上午/下午不同地點 → 兩筆 entries）：
日期：15-4-2026（日更）
車牌：WC987
姓名：蘇啟泰
上午：公司：明達T23W021 地點：東邊存倉-北跑 車數：3車
下午：公司：金門3802 地點：三跑山地-屬區內 車數：5車
→ entries: [
  { date:"2026-04-15", name:"蘇啟泰", equipment_no:"WC987", company:"明達", contract_no:"T23W021", start_location:"東邊存倉", end_location:"北跑", start_time:"", end_time:"", day_night:"日", quantity:3, unit:"車" },
  { date:"2026-04-15", name:"蘇啟泰", equipment_no:"WC987", company:"金門", contract_no:"3802", start_location:"三跑山地", end_location:"屬區內", start_time:"", end_time:"", day_night:"日", quantity:5, unit:"車" }
]
注意：同一天同一車牌但上午/下午地點不同，要拆成兩筆 entries，共用同一天和姓名。適用於運輸部。

## 輸出 JSON 格式

{
  "is_clock_in": true,
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "name": "員工中文姓名",
      "equipment_no": "機械編號或車牌",
      "company": "客戶/公司名稱",
      "contract_no": "合約號碼",
      "start_location": "起點/工作地點",
      "end_location": "終點",
      "work_content": "工作內容描述",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "day_night": "日 或 夜",
      "quantity": 數字,
      "unit": "天/晚/車",
      "ot_quantity": 數字,
      "ot_unit": "小時",
      "is_mid_shift": false,
      "product_name": "商品名稱（如花泥、碎石等）",
      "remarks": "備註"
    }
  ]
}

## 重要解析規則

### 日期
- 格式：D-M-YYYY、DD-MM-YYYY、D-MM-YYYY（日-月-年，最常見）
- M-D-YYYY（如 4-14-2026，月在前，當日>12時可判斷）
- D-D-M-YYYY（如 14-15-4-2026，日期範圍）→ **只取第一天作為 date，不要輸出 date_end**，只建一筆 work_log
  - 理由：夜班日期範圍是「第一天晚上開始、第二天早上結束」，屬於同一筆工作
  - 不同於 Order（Order 日期範圍會建多筆）
- 全形數字轉半形
- 今天是 ${todayStr}

### 日/夜判斷
- 「日更」「日班」→ day_night: "日"
- 「夜更」「夜班」「夜」→ day_night: "夜"
- 時間在 19:00-08:00 範圍 → day_night: "夜"
- 時間在 06:00-19:00 範圍 → day_night: "日"
- 無法判斷時預設 "日"

### 時間 → 天數/晚數計算
- 日班（06:00-19:00 範圍內）→ quantity: 1, unit: "天"
- 夜班（19:00-08:00 範圍內）→ quantity: 1, unit: "晚"
- 半天（如 08:00-12:00）→ quantity: 0.5, unit: "天"
- 超過標準工時（日班超過 18:00）= OT，如 08:00-19:00 → quantity: 1, unit: "天", ot_quantity: 1, ot_unit: "小時"
- 「中直」或「中直:1」→ is_mid_shift: true
- 「ot1小時」或「OT」→ ot_quantity: 1（如果只寫 OT 沒有數字，預設 1）

### 運輸部車數
- 「6車」→ quantity: 6, unit: "車"
- 「3車出3車入」→ quantity: 6, unit: "車"（3+3=6）
- 「共4車」→ quantity: 4, unit: "車"
- 「租車一天」→ quantity: 1, unit: "天"
- 只寫時間沒寫車數 → quantity: 1, unit: "天"

### 客戶/合約解析
- 「金門3802」→ company: "金門", contract_no: "3802"
- 「明達T23W021」→ company: "明達", contract_no: "T23W021"
- 合約號碼格式：T23W021、PA13114、3802、3310WH451、3901A 等（英數混合）
- 如果「公司」欄位只有公司名沒有合約號，且有單獨的「合約」欄位，分開解析
- 「力哥架步清場」→ company: "力哥", work_content: "架步清場"
- 公司名如果寫「明達」且合約號也寫「明達」，則 contract_no 留空
- 簡體字轉繁體：金门→金門、明逹→明達

### 時間格式
- 各種分隔符：「-」「～」「－」「一」「.」「至」「到」「:」「：」
- 「08：00一18：00」= 08:00-18:00（全形冒號 + 一字）
- 「2300-0600」= 23:00-06:00（無冒號4位數）
- 「0800-1800」= 08:00-18:00
- 「08一17」= 08:00-17:00
- 「8.00一18:00」= 08:00-18:00
- 時間後面可能有額外資訊如「08:00 -18:00-頂，啊強」→ start_time:"08:00", end_time:"18:00", remarks:"頂，啊強"

### 車牌修正
- 「MC26OO」→「MC2600」（英文O改數字0）
- 「Y丅6383」→「YT6383」（丅改T）
- 「ZY 4778」→「ZY4778」（去空格）
- 機械編號統一格式：「DC7」→「DC07」、「DC 08」→「DC08」

### 地點解析
- 「東邊存倉-北跑重鋪花泥」→ start_location:"東邊存倉", end_location:"北跑", work_content:"重鋪花泥"
- 「蓮麻坑-內運」→ start_location:"蓮麻坑", work_content:"內運"
- 「小蠔灣濾水廠-TM38」→ start_location:"小蠔灣濾水廠", end_location:"TM38"
- 「東面機場路至稔灣」→ start_location:"東面機場路", end_location:"稔灣"
- 用「-」「至」「去」「到」分隔起點和終點

### 非報工訊息
- 請假、休息、閒聊、問候、通知、圖片描述 → is_clock_in: false
- 「收到」「OK」「👍」等確認回覆 → is_clock_in: false

## ERP 員工列表（用於姓名匹配）
${refs.employeeRef}

## ERP 客戶列表
${refs.partnerRef}

## ERP 合約列表
${refs.contractRef}

請僅輸出乾淨 JSON，不要加 \`\`\`json 標記。一條訊息通常只有一筆報工（一個 entry）。以下情況可以有多個 entries：
1. 同一條訊息包含多人報工
2. 運輸部同一天上午/下午到不同地點（地點不同、車數分開列出）
日期範圍（如 13-14-4-2026）不要拆成多筆，只取第一天作為 date。`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const cleaned = content.replace(/```json|```/g, '').trim();
      const raw = JSON.parse(cleaned);

      if (!raw.is_clock_in) {
        return { is_clock_in: false, entries: [], raw_text: text };
      }

      const entries: ParsedClockInEntry[] = (raw.entries || []).map((e: Record<string, unknown>) => ({
        date: String(e.date || todayStr),
        date_end: e.date_end ? String(e.date_end) : undefined,
        name: String(e.name || ''),
        equipment_no: String(e.equipment_no || ''),
        company: String(e.company || ''),
        contract_no: String(e.contract_no || ''),
        start_location: String(e.start_location || ''),
        end_location: String(e.end_location || ''),
        work_content: String(e.work_content || ''),
        start_time: this.normalizeTime(String(e.start_time || '')),
        end_time: this.normalizeTime(String(e.end_time || '')),
        day_night: String(e.day_night || '日'),
        quantity: Number(e.quantity) || 0,
        unit: String(e.unit || '天'),
        ot_quantity: Number(e.ot_quantity) || 0,
        ot_unit: String(e.ot_unit || '小時'),
        is_mid_shift: Boolean(e.is_mid_shift),
        product_name: String(e.product_name || ''),
        remarks: String(e.remarks || ''),
        is_clock_in: true,
      }));

      // 後處理：如果沒有 quantity，根據時間計算
      for (const entry of entries) {
        if (entry.quantity === 0 && entry.start_time && entry.end_time) {
          const calc = this.calculateQuantity(entry.start_time, entry.end_time, entry.day_night);
          entry.quantity = calc.quantity;
          entry.unit = calc.unit;
          if (calc.ot > 0 && entry.ot_quantity === 0) {
            entry.ot_quantity = calc.ot;
            entry.ot_unit = '小時';
          }
        }
        // 如果運輸部有車數，保留車數；沒有車數但有時間，設為 1 天
        if (serviceType === '運輸' && entry.quantity === 0) {
          entry.quantity = 1;
          entry.unit = '天';
        }
      }

      return { is_clock_in: true, entries, raw_text: text };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`AI parsing error: ${errMsg}`);
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 時間正規化
  // ────────────────────────────────────────────────────────────

  private normalizeTime(time: string): string {
    if (!time) return '';
    // 去除全形字元
    let t = time.replace(/：/g, ':').replace(/．/g, '.').trim();
    // 4位數無冒號：0800 → 08:00
    if (/^\d{4}$/.test(t)) {
      t = t.slice(0, 2) + ':' + t.slice(2);
    }
    // 用點號：8.00 → 8:00
    t = t.replace(/\./g, ':');
    // 補零：8:00 → 08:00
    const match = t.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      return match[1].padStart(2, '0') + ':' + match[2];
    }
    // 只有數字：8 → 08:00, 17 → 17:00
    const numOnly = t.match(/^(\d{1,2})$/);
    if (numOnly) {
      return numOnly[1].padStart(2, '0') + ':00';
    }
    return t;
  }

  // ────────────────────────────────────────────────────────────
  // 天數/晚數計算
  // ────────────────────────────────────────────────────────────

  private calculateQuantity(
    startTime: string,
    endTime: string,
    dayNight: string,
  ): { quantity: number; unit: string; ot: number } {
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    if (startMinutes === null || endMinutes === null) {
      return { quantity: 1, unit: dayNight === '夜' ? '晚' : '天', ot: 0 };
    }

    // 夜班
    if (dayNight === '夜' || startMinutes >= 19 * 60) {
      return { quantity: 1, unit: '晚', ot: 0 };
    }

    // 日班
    let duration: number;
    if (endMinutes > startMinutes) {
      duration = endMinutes - startMinutes;
    } else {
      // 跨日
      duration = (24 * 60 - startMinutes) + endMinutes;
    }

    const hours = duration / 60;

    // 半天判斷
    if (hours <= 5) {
      return { quantity: 0.5, unit: '天', ot: 0 };
    }

    // 標準日班 ≤ 10 小時（08:00-18:00）
    if (hours <= 10) {
      return { quantity: 1, unit: '天', ot: 0 };
    }

    // 超過標準工時 = OT
    const otHours = Math.ceil(hours - 10);
    return { quantity: 1, unit: '天', ot: otHours };
  }

  private timeToMinutes(time: string): number | null {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  // ────────────────────────────────────────────────────────────
  // 日期解析（Clockin 只取第一天）
  // ────────────────────────────────────────────────────────────

  /**
   * Clockin 日期範圍只取起始日（第一天）。
   * 例如「13-14-4-2026（夜班）」= 13/4 晚上開始，scheduled_date = 2026-04-13。
   * 與 Order 不同，Order 會拆成多筆；Clockin 只建一筆。
   */
  private expandDateRange(dateStr: string, _dateEndStr?: string): Date[] {
    const start = this.parseDate(dateStr);
    if (!start) return [new Date()];
    return [start];
  }

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // YYYY-MM-DD
    const iso = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    }

    // DD-MM-YYYY or D-M-YYYY
    const dmy = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 員工匹配
  // ────────────────────────────────────────────────────────────

  private matchEmployee(
    name: string,
    employees: { id: number; nickname: string | null; name_zh: string | null; name_en: string | null }[],
    nicknames: { emp_nickname_employee_id: number; emp_nickname_value: string }[],
  ): { id: number } | null {
    if (!name) return null;
    const n = name.trim();

    // 1. 精確匹配 name_zh
    for (const e of employees) {
      if (e.name_zh && e.name_zh === n) {
        return { id: e.id };
      }
    }

    // 2. 精確匹配 nickname
    for (const e of employees) {
      if (e.nickname && e.nickname === n) {
        return { id: e.id };
      }
    }

    // 3. 精確匹配 EmployeeNickname
    for (const nn of nicknames) {
      if (nn.emp_nickname_value === n) {
        return { id: nn.emp_nickname_employee_id };
      }
    }

    // 4. 不區分大小寫匹配
    const nLower = n.toLowerCase();
    for (const e of employees) {
      if (
        (e.name_zh && e.name_zh.toLowerCase() === nLower) ||
        (e.nickname && e.nickname.toLowerCase() === nLower) ||
        (e.name_en && e.name_en.toLowerCase() === nLower)
      ) {
        return { id: e.id };
      }
    }

    // 5. 包含匹配（名字較短時）
    if (n.length >= 2) {
      for (const e of employees) {
        if (
          (e.name_zh && (e.name_zh.includes(n) || n.includes(e.name_zh))) ||
          (e.nickname && (e.nickname.includes(n) || n.includes(e.nickname)))
        ) {
          return { id: e.id };
        }
      }
    }

    // 6. EmployeeNickname 包含匹配
    for (const nn of nicknames) {
      if (nn.emp_nickname_value.includes(n) || n.includes(nn.emp_nickname_value)) {
        return { id: nn.emp_nickname_employee_id };
      }
    }

    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 客戶匹配
  // ────────────────────────────────────────────────────────────

  private matchPartner(
    company: string,
    partners: { id: number; name: string | null; name_en: string | null }[],
  ): { id: number } | null {
    if (!company) return null;
    const c = company.trim().toLowerCase();

    // 精確匹配
    for (const p of partners) {
      if (
        (p.name && p.name.toLowerCase() === c) ||
        (p.name_en && p.name_en.toLowerCase() === c)
      ) {
        return { id: p.id };
      }
    }

    // 包含匹配
    for (const p of partners) {
      if (
        (p.name && (p.name.toLowerCase().includes(c) || c.includes(p.name.toLowerCase()))) ||
        (p.name_en && (p.name_en.toLowerCase().includes(c) || c.includes(p.name_en.toLowerCase())))
      ) {
        return { id: p.id };
      }
    }

    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 合約匹配
  // ────────────────────────────────────────────────────────────

  private matchContract(
    contractNo: string,
    contracts: { id: number; contract_no: string | null; contract_name: string | null }[],
  ): { id: number } | null {
    if (!contractNo) return null;
    const cn = contractNo.trim().toLowerCase().replace(/\s+/g, '');

    for (const c of contracts) {
      const cno = (c.contract_no || '').toLowerCase().replace(/\s+/g, '');
      if (cno && (cno === cn || cno.includes(cn) || cn.includes(cno))) {
        return { id: c.id };
      }
    }

    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 設備匹配
  // ────────────────────────────────────────────────────────────

  private matchEquipment(
    equipmentNo: string,
    machinery: { id: number; machine_code: string | null; brand: string | null; model: string | null; machine_type: string | null; tonnage: unknown }[],
    vehicles: { id: number; plate_number: string | null; machine_type: string | null; tonnage: unknown }[],
  ): { type: string; source: 'machinery' | 'vehicle'; tonnage: string | null } | null {
    if (!equipmentNo) return null;
    const eq = equipmentNo.trim().toUpperCase().replace(/\s+/g, '');

    // 匹配機械
    for (const m of machinery) {
      const code = (m.machine_code || '').toUpperCase().replace(/\s+/g, '');
      if (code && (code === eq || code.includes(eq) || eq.includes(code))) {
        return { type: m.machine_type || '機械', source: 'machinery', tonnage: m.tonnage != null ? String(m.tonnage) : null };
      }
    }

    // 匹配車輛
    for (const v of vehicles) {
      const plate = (v.plate_number || '').toUpperCase().replace(/\s+/g, '');
      if (plate && (plate === eq || plate.includes(eq) || eq.includes(plate))) {
        return { type: v.machine_type || '車輛', source: 'vehicle', tonnage: v.tonnage != null ? String(v.tonnage) : null };
      }
    }

    // 根據編號前綴推斷
    if (/^DC\d/i.test(eq)) return { type: '挖掘機', source: 'machinery', tonnage: null };
    if (/^[A-Z]{2,3}\d{3,4}$/i.test(eq)) return { type: '泥頭車', source: 'vehicle', tonnage: null };

    return null;
  }

  // ────────────────────────────────────────────────────────────
  // 靜態工具：判斷是否為報工群組
  // ────────────────────────────────────────────────────────────

  static isClockinGroup(chatId: string): boolean {
    return CLOCKIN_GROUP_IDS.includes(chatId);
  }

  static getGroupInfo(chatId: string): { department: string; service_type: string } | null {
    return CLOCKIN_GROUP_MAP[chatId] || null;
  }
}
