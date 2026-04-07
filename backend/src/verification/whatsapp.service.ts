import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ParsedOrderItem {
  seq: number;
  order_type: 'transport' | 'manpower' | 'machinery' | 'notice' | 'leave';
  contract_no?: string;
  customer?: string;
  work_description?: string;
  location?: string;
  driver_nickname?: string;
  vehicle_no?: string;
  machine_code?: string;
  contact_person?: string;
  slip_write_as?: string;
  is_suspended: boolean;
  remarks?: string;
}

interface AiClassification {
  message_type: 'order' | 'modification' | 'chat';
  confidence: number;
  order_date?: string; // YYYY-MM-DD
  is_update: boolean;
  order_status: 'tentative' | 'confirmed';
  items: ParsedOrderItem[];
  leave_list: string[];
  raw_summary?: string;
  // modification-specific fields
  modifications?: AiModification[];
}

interface AiModification {
  mod_type: 'cancel' | 'reassign' | 'suspend' | 'resume' | 'add' | 'other';
  target_date?: string; // YYYY-MM-DD — which day's order to modify
  target_vehicle_no?: string;
  target_driver_nickname?: string;
  target_machine_code?: string;
  target_contract_no?: string;
  target_description?: string; // free-text description of what to match
  new_driver_nickname?: string; // for reassign
  new_vehicle_no?: string; // for reassign
  new_items?: ParsedOrderItem[]; // for add
  description: string; // human-readable description of the modification
  confidence: number;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI();
  }

  // ══════════════════════════════════════════════════════════════
  // 處理 WhatsApp Webhook 訊息
  // ══════════════════════════════════════════════════════════════
  async processWebhookMessage(payload: {
    chatId: string;
    sender: string;
    text: string;
    groupName?: string;
  }) {
    const { chatId, sender, text, groupName } = payload;

    if (!text || text.trim().length < 3) {
      return { processed: false, reason: 'message_too_short' };
    }

    // 1. 儲存原始訊息
    const waMessage = await this.prisma.verificationWaMessage.create({
      data: {
        wa_msg_remote_id: null,
        wa_msg_group_id: chatId,
        wa_msg_group_name: groupName || null,
        wa_msg_sender_jid: null,
        wa_msg_sender_name: sender,
        wa_msg_timestamp: new Date(),
        wa_msg_body: text,
        wa_msg_type: 'text',
        wa_msg_is_forwarded: false,
        wa_msg_has_media: false,
        wa_msg_ai_classified: null,
        wa_msg_ai_confidence: null,
        wa_msg_processed: false,
      },
    });

    // 2. 用 AI 判斷訊息類型並解析
    let classification: AiClassification;
    try {
      classification = await this.classifyAndParseMessage(text);
    } catch (error) {
      this.logger.error(`AI classification failed for message ${waMessage.id}:`, error);
      await this.prisma.verificationWaMessage.update({
        where: { id: waMessage.id },
        data: {
          wa_msg_ai_classified: 'error',
          wa_msg_processed: true,
        },
      });
      return { processed: false, reason: 'ai_error', message_id: waMessage.id };
    }

    // 3. 更新訊息分類結果
    await this.prisma.verificationWaMessage.update({
      where: { id: waMessage.id },
      data: {
        wa_msg_ai_classified: classification.message_type,
        wa_msg_ai_confidence: classification.confidence,
        wa_msg_processed: true,
      },
    });

    // 4. 根據分類結果處理
    switch (classification.message_type) {
      case 'order':
        return this.handleOrder(waMessage.id, classification, sender, text);

      case 'modification':
        return this.handleModification(waMessage.id, classification, sender, text);

      case 'chat':
      default:
        return {
          processed: true,
          is_order: false,
          message_type: 'chat',
          message_id: waMessage.id,
          confidence: classification.confidence,
        };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 處理完整 Order
  // ══════════════════════════════════════════════════════════════
  private async handleOrder(
    messageId: number,
    classification: AiClassification,
    sender: string,
    text: string,
  ) {
    const orderDate = classification.order_date
      ? new Date(classification.order_date)
      : new Date();

    // 版本管理：檢查同一天是否已有 order
    const existingOrders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: orderDate,
        wa_order_msg_id: { not: null },
      },
      orderBy: { wa_order_version: 'desc' },
      take: 1,
    });

    const version = existingOrders.length > 0
      ? existingOrders[0].wa_order_version + 1
      : 1;

    const waOrder = await this.prisma.verificationWaOrder.create({
      data: {
        wa_order_msg_id: messageId,
        wa_order_date: orderDate,
        wa_order_status: classification.order_status,
        wa_order_version: version,
        wa_order_sender_name: sender,
        wa_order_sender_role: null,
        wa_order_raw_text: text,
        wa_order_item_count: classification.items.length,
        wa_order_ai_model: 'gpt-4.1-mini',
        wa_order_ai_confidence: classification.confidence,
      },
    });

    // 存入 order items
    if (classification.items.length > 0) {
      await this.prisma.verificationWaOrderItem.createMany({
        data: classification.items.map((item, idx) => ({
          wa_item_order_id: waOrder.id,
          wa_item_seq: item.seq || idx + 1,
          wa_item_contract_no: item.contract_no || null,
          wa_item_customer: item.customer || null,
          wa_item_work_desc: item.work_description || null,
          wa_item_location: item.location || null,
          wa_item_driver_nickname: item.driver_nickname || null,
          wa_item_driver_id: null,
          wa_item_vehicle_no: item.vehicle_no || null,
          wa_item_machine_code: item.machine_code || null,
          wa_item_contact_person: item.contact_person || null,
          wa_item_slip_write_as: item.slip_write_as || null,
          wa_item_is_suspended: item.is_suspended || false,
          wa_item_remarks: item.remarks || null,
          wa_item_mod_status: null,
          wa_item_mod_prev_data: undefined,
        })),
      });
    }

    // 同步到 verification_records
    await this.syncToVerificationRecords(waOrder.id, classification, orderDate, sender);

    return {
      processed: true,
      message_type: 'order',
      is_order: true,
      message_id: messageId,
      order_id: waOrder.id,
      order_date: classification.order_date,
      version,
      item_count: classification.items.length,
      leave_count: classification.leave_list.length,
      confidence: classification.confidence,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 處理修改指令 (modification)
  // ══════════════════════════════════════════════════════════════
  private async handleModification(
    messageId: number,
    classification: AiClassification,
    sender: string,
    text: string,
  ) {
    const modifications = classification.modifications || [];
    if (modifications.length === 0) {
      return {
        processed: true,
        message_type: 'modification',
        message_id: messageId,
        modifications_applied: 0,
        reason: 'no_modifications_parsed',
      };
    }

    const results: any[] = [];

    for (const mod of modifications) {
      try {
        const result = await this.applyModification(messageId, mod, sender);
        results.push(result);
      } catch (error) {
        this.logger.error(`Failed to apply modification:`, error);
        results.push({ success: false, error: String(error) });
      }
    }

    return {
      processed: true,
      message_type: 'modification',
      message_id: messageId,
      modifications_applied: results.filter((r) => r.success).length,
      modifications_total: modifications.length,
      details: results,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 套用單個修改指令
  // ══════════════════════════════════════════════════════════════
  private async applyModification(
    messageId: number,
    mod: AiModification,
    sender: string,
  ) {
    // 1. 找到目標日期的最新版 order
    const targetDate = mod.target_date ? new Date(mod.target_date) : new Date();
    // Set to start of day for comparison
    const dateStart = new Date(targetDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    const latestOrder = await this.prisma.verificationWaOrder.findFirst({
      where: {
        wa_order_date: {
          gte: dateStart,
          lte: dateEnd,
        },
      },
      orderBy: { wa_order_version: 'desc' },
      include: {
        items: true,
      },
    });

    if (!latestOrder) {
      return {
        success: false,
        reason: 'no_order_found',
        target_date: mod.target_date,
        description: mod.description,
      };
    }

    // 2. 根據修改類型找到匹配的 order item(s)
    if (mod.mod_type === 'add') {
      return this.applyAddModification(messageId, latestOrder, mod);
    }

    // 找匹配的 item
    const matchedItems = this.findMatchingItems(latestOrder.items, mod);

    if (matchedItems.length === 0) {
      // 即使沒找到精確匹配，也記錄修改日誌（order 級別）
      await this.prisma.verificationWaModLog.create({
        data: {
          mod_order_id: latestOrder.id,
          mod_item_id: null,
          mod_msg_id: messageId,
          mod_type: mod.mod_type,
          mod_description: mod.description,
          mod_prev_value: Prisma.DbNull,
          mod_new_value: Prisma.DbNull,
          mod_ai_confidence: mod.confidence,
        },
      });

      return {
        success: true,
        reason: 'no_matching_item_found_but_logged',
        order_id: latestOrder.id,
        description: mod.description,
      };
    }

    // 3. 對每個匹配的 item 套用修改
    const itemResults: any[] = [];
    for (const item of matchedItems) {
      const result = await this.applyModToItem(messageId, latestOrder.id, item, mod);
      itemResults.push(result);
    }

    return {
      success: true,
      order_id: latestOrder.id,
      mod_type: mod.mod_type,
      items_modified: itemResults.length,
      description: mod.description,
      details: itemResults,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 找匹配的 order items
  // ══════════════════════════════════════════════════════════════
  private findMatchingItems(items: any[], mod: AiModification): any[] {
    return items.filter((item) => {
      // 車牌匹配
      if (mod.target_vehicle_no && item.wa_item_vehicle_no) {
        const normalizedTarget = mod.target_vehicle_no.replace(/\s/g, '').toUpperCase();
        const normalizedItem = item.wa_item_vehicle_no.replace(/\s/g, '').toUpperCase();
        if (normalizedTarget === normalizedItem) return true;
      }

      // 司機花名匹配
      if (mod.target_driver_nickname && item.wa_item_driver_nickname) {
        const targetNick = mod.target_driver_nickname.trim().toLowerCase();
        const itemNick = item.wa_item_driver_nickname.trim().toLowerCase();
        if (targetNick === itemNick || itemNick.includes(targetNick) || targetNick.includes(itemNick)) {
          return true;
        }
      }

      // 機械編號匹配
      if (mod.target_machine_code && item.wa_item_machine_code) {
        const normalizedTarget = mod.target_machine_code.replace(/\s/g, '').toUpperCase();
        const normalizedItem = item.wa_item_machine_code.replace(/\s/g, '').toUpperCase();
        if (normalizedTarget === normalizedItem) return true;
      }

      // 合約號匹配
      if (mod.target_contract_no && item.wa_item_contract_no) {
        const normalizedTarget = mod.target_contract_no.replace(/\s/g, '').toUpperCase();
        const normalizedItem = item.wa_item_contract_no.replace(/\s/g, '').toUpperCase();
        if (normalizedTarget === normalizedItem) return true;
      }

      return false;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // 套用修改到單個 item
  // ══════════════════════════════════════════════════════════════
  private async applyModToItem(
    messageId: number,
    orderId: number,
    item: any,
    mod: AiModification,
  ) {
    // 保存修改前的快照
    const prevSnapshot: Record<string, any> = {
      wa_item_driver_nickname: item.wa_item_driver_nickname,
      wa_item_vehicle_no: item.wa_item_vehicle_no,
      wa_item_machine_code: item.wa_item_machine_code,
      wa_item_is_suspended: item.wa_item_is_suspended,
      wa_item_mod_status: item.wa_item_mod_status,
    };

    // 根據修改類型更新 item
    const updateData: any = {};
    let modStatus: string;
    const newSnapshot: Record<string, any> = {};

    switch (mod.mod_type) {
      case 'cancel':
        modStatus = 'cancelled';
        updateData.wa_item_mod_status = 'cancelled';
        updateData.wa_item_mod_prev_data = prevSnapshot;
        newSnapshot.wa_item_mod_status = 'cancelled';
        break;

      case 'reassign':
        modStatus = 'reassigned';
        updateData.wa_item_mod_status = 'reassigned';
        updateData.wa_item_mod_prev_data = prevSnapshot;
        if (mod.new_driver_nickname) {
          updateData.wa_item_driver_nickname = mod.new_driver_nickname;
          newSnapshot.wa_item_driver_nickname = mod.new_driver_nickname;
        }
        if (mod.new_vehicle_no) {
          updateData.wa_item_vehicle_no = mod.new_vehicle_no;
          newSnapshot.wa_item_vehicle_no = mod.new_vehicle_no;
        }
        break;

      case 'suspend':
        modStatus = 'suspended';
        updateData.wa_item_is_suspended = true;
        updateData.wa_item_mod_status = 'suspended';
        updateData.wa_item_mod_prev_data = prevSnapshot;
        newSnapshot.wa_item_is_suspended = true;
        newSnapshot.wa_item_mod_status = 'suspended';
        break;

      case 'resume':
        modStatus = 'resumed';
        updateData.wa_item_is_suspended = false;
        updateData.wa_item_mod_status = null; // clear mod status on resume
        updateData.wa_item_mod_prev_data = prevSnapshot;
        newSnapshot.wa_item_is_suspended = false;
        break;

      default:
        modStatus = 'other';
        updateData.wa_item_mod_status = 'other';
        updateData.wa_item_mod_prev_data = prevSnapshot;
        newSnapshot.wa_item_mod_status = 'other';
        break;
    }

    // 更新 order item
    await this.prisma.verificationWaOrderItem.update({
      where: { id: item.id },
      data: updateData,
    });

    // 記錄修改日誌
    await this.prisma.verificationWaModLog.create({
      data: {
        mod_order_id: orderId,
        mod_item_id: item.id,
        mod_msg_id: messageId,
        mod_type: mod.mod_type,
        mod_description: mod.description,
        mod_prev_value: prevSnapshot,
        mod_new_value: newSnapshot,
        mod_ai_confidence: mod.confidence,
      },
    });

    return {
      item_id: item.id,
      mod_type: mod.mod_type,
      mod_status: modStatus,
      prev: prevSnapshot,
      new: newSnapshot,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 套用新增修改
  // ══════════════════════════════════════════════════════════════
  private async applyAddModification(
    messageId: number,
    order: any,
    mod: AiModification,
  ) {
    const newItems = mod.new_items || [];
    if (newItems.length === 0) {
      // 如果沒有具體新增項目，只記錄日誌
      await this.prisma.verificationWaModLog.create({
        data: {
          mod_order_id: order.id,
          mod_item_id: null,
          mod_msg_id: messageId,
          mod_type: 'add',
          mod_description: mod.description,
          mod_prev_value: Prisma.DbNull,
          mod_new_value: Prisma.DbNull,
          mod_ai_confidence: mod.confidence,
        },
      });
      return { success: true, reason: 'add_logged_no_items', order_id: order.id };
    }

    // 計算新的 seq 起始值
    const maxSeq = order.items.reduce(
      (max: number, item: any) => Math.max(max, item.wa_item_seq),
      0,
    );

    const createdItems: number[] = [];
    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      const created = await this.prisma.verificationWaOrderItem.create({
        data: {
          wa_item_order_id: order.id,
          wa_item_seq: maxSeq + i + 1,
          wa_item_contract_no: item.contract_no || null,
          wa_item_customer: item.customer || null,
          wa_item_work_desc: item.work_description || null,
          wa_item_location: item.location || null,
          wa_item_driver_nickname: item.driver_nickname || null,
          wa_item_driver_id: null,
          wa_item_vehicle_no: item.vehicle_no || null,
          wa_item_machine_code: item.machine_code || null,
          wa_item_contact_person: item.contact_person || null,
          wa_item_slip_write_as: item.slip_write_as || null,
          wa_item_is_suspended: item.is_suspended || false,
          wa_item_remarks: item.remarks || null,
          wa_item_mod_status: 'added',
          wa_item_mod_prev_data: undefined,
        },
      });
      createdItems.push(created.id);

      // 記錄修改日誌
      await this.prisma.verificationWaModLog.create({
        data: {
          mod_order_id: order.id,
          mod_item_id: created.id,
          mod_msg_id: messageId,
          mod_type: 'add',
          mod_description: mod.description,
          mod_prev_value: Prisma.DbNull,
          mod_new_value: item as any,
          mod_ai_confidence: mod.confidence,
        },
      });
    }

    // 更新 order item count
    const totalItems = await this.prisma.verificationWaOrderItem.count({
      where: { wa_item_order_id: order.id },
    });
    await this.prisma.verificationWaOrder.update({
      where: { id: order.id },
      data: { wa_order_item_count: totalItems },
    });

    return {
      success: true,
      order_id: order.id,
      mod_type: 'add',
      items_added: createdItems.length,
      item_ids: createdItems,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // AI 分類和解析（支援 order / modification / chat 三種類型）
  // ══════════════════════════════════════════════════════════════
  private async classifyAndParseMessage(text: string): Promise<AiClassification> {
    const systemPrompt = `你是一個專門分析香港建築運輸公司 WhatsApp 群組訊息的 AI 助手。
你的任務是：
1. 判斷訊息屬於哪種類型：order（完整工作分配）、modification（修改指令）、chat（一般對話）
2. 根據類型解析出結構化數據

## 三種訊息類型

### order（完整工作分配）
- 包含日期（如 2-4-2026）和多個工作分配項目
- 運輸工作分配：客戶/合約 + 路線 + 司機花名 + 車牌
- 管工/雜項人員分配：地盤/合約 + 工作描述 + 人員名字
- 機械調配：合約 + DC 機械編號 + 操作員
- 通常有多行，結構化的工作安排
- 少於 3 行的短訊息通常不是完整 order

### modification（修改指令）
修改指令是針對已有 order 的局部修改，例如：
- 取消某項工作：「明天 CJ591 取消」「XX車唔使去」
- 換人/換車：「陳大文請假，改派李小明」「XX車改YY車」
- 暫停某項工作：「三跑 DC18 暫停一日」「XX暫停」
- 恢復暫停的工作：「DC18 照做」「XX恢復」
- 新增工作項目：「加多一架車去觀塘」「再加XX」
- 人員請假通知：「XX請假」（如果只是通知某人請假，需要從 order 中取消/替換該人的工作）
- 特徵：短訊息、包含動作詞（取消、改、暫停、加、請假等）、提及具體車牌/人名/機械編號

### chat（一般對話）
- 一般討論、確認回覆（「收到」「OK」「明白」）
- emoji 反應
- 與工作分配無關的閒聊

## Order 類型
- transport: 運輸工作（有車牌和司機）
- manpower: 管工/雜項人員分配（有人員名字和工作地點）
- machinery: 機械調配（有 DC 編號）
- notice: 臨時通知
- leave: 請假

## 修改類型 (mod_type)
- cancel: 取消某項工作
- reassign: 換人或換車
- suspend: 暫停某項工作
- resume: 恢復已暫停的工作
- add: 新增工作項目
- other: 其他修改

## 重要格式特徵
- 日期格式：D-M-YYYY 或 D-M-YYYY（星期X）或 D-M-YYYY(暫定)
- 「暫定」表示暫定版本，「更新」表示更新版本
- 「暫停」表示該工作項目暫停
- [飛仔寫: xxx] 表示飛仔上要寫的客戶名
- 車牌格式：2-3個英文字母 + 數字（如 WY8724, XF2103, EM987, CJ591）
- 機械編號：DC + 數字（如 DC14, DC20, DC18）
- 合約號：如 T24W019, T22M241, PA13114, 3802 等
- 司機用花名/暱稱（如 峰仔、肥洪、隆、旋、棋、偉、文仔）
- 「明天」「聽日」「今日」等相對日期要轉換為實際日期（基於今天 ${new Date().toISOString().slice(0, 10)}）

## 回覆格式
請以 JSON 格式回覆（不要加 markdown 代碼塊標記）：

如果是 order：
{
  "message_type": "order",
  "confidence": 0.0-1.0,
  "order_date": "YYYY-MM-DD" 或 null,
  "is_update": true/false,
  "order_status": "tentative" 或 "confirmed",
  "items": [
    {
      "seq": 1,
      "order_type": "transport/manpower/machinery/notice/leave",
      "contract_no": "合約號或null",
      "customer": "客戶名或null",
      "work_description": "工作描述或null",
      "location": "地點/路線或null",
      "driver_nickname": "司機花名或null",
      "vehicle_no": "車牌或null",
      "machine_code": "機械編號或null",
      "contact_person": "聯絡人資訊或null",
      "slip_write_as": "飛仔寫什麼或null",
      "is_suspended": true/false,
      "remarks": "備註或null"
    }
  ],
  "leave_list": ["請假人員1", "請假人員2"],
  "raw_summary": "簡短摘要"
}

如果是 modification：
{
  "message_type": "modification",
  "confidence": 0.0-1.0,
  "modifications": [
    {
      "mod_type": "cancel/reassign/suspend/resume/add/other",
      "target_date": "YYYY-MM-DD 或 null（null 表示今天或最近的 order）",
      "target_vehicle_no": "目標車牌或null",
      "target_driver_nickname": "目標司機花名或null",
      "target_machine_code": "目標機械編號或null",
      "target_contract_no": "目標合約號或null",
      "target_description": "目標描述（用於模糊匹配）或null",
      "new_driver_nickname": "新司機花名或null（reassign 時用）",
      "new_vehicle_no": "新車牌或null（reassign 時用）",
      "new_items": [（add 時用，格式同 order items）],
      "description": "人類可讀的修改描述",
      "confidence": 0.0-1.0
    }
  ],
  "order_date": null,
  "is_update": false,
  "order_status": "tentative",
  "items": [],
  "leave_list": [],
  "raw_summary": "簡短摘要"
}

如果是 chat：
{
  "message_type": "chat",
  "confidence": 0.0-1.0,
  "order_date": null,
  "is_update": false,
  "order_status": "tentative",
  "items": [],
  "leave_list": [],
  "raw_summary": "簡短摘要"
}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `請分析以下 WhatsApp 訊息：\n\n${text}` },
      ],
      temperature: 0.1,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || '';

    // 移除可能的 markdown 代碼塊標記
    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      // Ensure backward compatibility: if AI returns is_order instead of message_type
      if (parsed.is_order !== undefined && !parsed.message_type) {
        parsed.message_type = parsed.is_order ? 'order' : 'chat';
      }
      return parsed;
    } catch (parseError) {
      this.logger.warn(`Failed to parse AI response: ${cleaned.substring(0, 200)}`);
      return {
        message_type: 'chat' as const,
        confidence: 0,
        is_update: false,
        order_status: 'tentative' as const,
        items: [],
        leave_list: [],
        raw_summary: 'AI parse error',
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 同步到 verification_records 用於交叉比對
  // ══════════════════════════════════════════════════════════════
  private async syncToVerificationRecords(
    orderId: number,
    classification: AiClassification,
    orderDate: Date,
    sender: string,
  ) {
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'whatsapp_order' },
    });
    if (!source) {
      this.logger.warn('whatsapp_order source not found, skipping sync to verification_records');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dateStr = classification.order_date || today;
    const existingCount = await this.prisma.verificationBatch.count({
      where: {
        batch_code: { startsWith: `BATCH-${today}-whatsapp_order` },
      },
    });
    const batchCode = `BATCH-${today}-whatsapp_order-${String(existingCount + 1).padStart(3, '0')}`;

    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: `WhatsApp Order ${dateStr} from ${sender}`,
        batch_total_rows: classification.items.length,
        batch_filtered_rows: classification.items.length,
        batch_status: 'completed',
      },
    });

    const transportItems = classification.items.filter(
      (item) => item.vehicle_no || item.driver_nickname || item.machine_code,
    );

    if (transportItems.length > 0) {
      await this.prisma.verificationRecord.createMany({
        data: transportItems.map((item, idx) => ({
          record_batch_id: batch.id,
          record_source_id: source.id,
          record_source_row_number: idx + 1,
          record_work_date: orderDate,
          record_vehicle_no: item.vehicle_no || null,
          record_driver_name: item.driver_nickname || null,
          record_customer: item.customer || null,
          record_location_from: item.location || null,
          record_location_to: null,
          record_contract_no: item.contract_no || null,
          record_employee_name: item.driver_nickname || null,
          record_raw_data: item as any,
        })),
      });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 取得 WhatsApp Orders 列表（含修改日誌）
  // ══════════════════════════════════════════════════════════════
  async getWhatsappOrders(query: {
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, date_from, date_to, search } = query;

    const where: any = {};

    if (date_from || date_to) {
      where.wa_order_date = {};
      if (date_from) where.wa_order_date.gte = new Date(date_from);
      if (date_to) where.wa_order_date.lte = new Date(date_to);
    }

    if (search) {
      where.OR = [
        { wa_order_raw_text: { contains: search, mode: 'insensitive' } },
        { wa_order_sender_name: { contains: search, mode: 'insensitive' } },
        {
          items: {
            some: {
              OR: [
                { wa_item_vehicle_no: { contains: search, mode: 'insensitive' } },
                { wa_item_driver_nickname: { contains: search, mode: 'insensitive' } },
                { wa_item_customer: { contains: search, mode: 'insensitive' } },
                { wa_item_contract_no: { contains: search, mode: 'insensitive' } },
                { wa_item_machine_code: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    const total = await this.prisma.verificationWaOrder.count({ where });
    const orders = await this.prisma.verificationWaOrder.findMany({
      where,
      include: {
        message: {
          select: {
            wa_msg_group_name: true,
            wa_msg_sender_name: true,
            wa_msg_timestamp: true,
            wa_msg_ai_classified: true,
          },
        },
        items: {
          orderBy: { wa_item_seq: 'asc' },
          include: {
            mod_logs: {
              orderBy: { mod_created_at: 'desc' },
              include: {
                message: {
                  select: {
                    wa_msg_body: true,
                    wa_msg_sender_name: true,
                    wa_msg_timestamp: true,
                  },
                },
              },
            },
          },
        },
        mod_logs: {
          orderBy: { mod_created_at: 'desc' },
          include: {
            message: {
              select: {
                wa_msg_body: true,
                wa_msg_sender_name: true,
                wa_msg_timestamp: true,
              },
            },
          },
        },
      },
      orderBy: [
        { wa_order_date: 'desc' },
        { wa_order_version: 'desc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 取得單筆 WhatsApp Order 詳情（含修改日誌）
  // ══════════════════════════════════════════════════════════════
  async getWhatsappOrderDetail(orderId: number) {
    const order = await this.prisma.verificationWaOrder.findUnique({
      where: { id: orderId },
      include: {
        message: true,
        items: {
          orderBy: { wa_item_seq: 'asc' },
          include: {
            mod_logs: {
              orderBy: { mod_created_at: 'desc' },
              include: {
                message: {
                  select: {
                    wa_msg_body: true,
                    wa_msg_sender_name: true,
                    wa_msg_timestamp: true,
                  },
                },
              },
            },
          },
        },
        mod_logs: {
          orderBy: { mod_created_at: 'desc' },
          include: {
            message: {
              select: {
                wa_msg_body: true,
                wa_msg_sender_name: true,
                wa_msg_timestamp: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return null;
    }

    return order;
  }

  // ══════════════════════════════════════════════════════════════
  // 取得 WhatsApp Messages 列表（含分類結果）
  // ══════════════════════════════════════════════════════════════
  async getWhatsappMessages(query: {
    page?: number;
    limit?: number;
    classification?: string;
  }) {
    const { page = 1, limit = 20, classification } = query;

    const where: any = {};
    if (classification && classification !== 'all') {
      where.wa_msg_ai_classified = classification;
    }

    const total = await this.prisma.verificationWaMessage.count({ where });
    const messages = await this.prisma.verificationWaMessage.findMany({
      where,
      include: {
        orders: {
          select: {
            id: true,
            wa_order_date: true,
            wa_order_status: true,
            wa_order_version: true,
            wa_order_item_count: true,
          },
        },
      },
      orderBy: { wa_msg_created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: messages,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }
}
