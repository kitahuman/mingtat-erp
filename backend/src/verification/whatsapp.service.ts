import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

// ══════════════════════════════════════════════════════════════
// WhatsApp Order 解析結果介面
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
  is_order: boolean;
  confidence: number;
  order_date?: string; // YYYY-MM-DD
  is_update: boolean;
  order_status: 'tentative' | 'confirmed';
  items: ParsedOrderItem[];
  leave_list: string[];
  raw_summary?: string;
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

    if (!text || text.trim().length < 5) {
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

    // 2. 用 AI 判斷是否為 order 並解析
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
    const aiClassified = classification.is_order ? 'order' : 'chat';
    await this.prisma.verificationWaMessage.update({
      where: { id: waMessage.id },
      data: {
        wa_msg_ai_classified: aiClassified,
        wa_msg_ai_confidence: classification.confidence,
        wa_msg_processed: true,
      },
    });

    // 4. 如果不是 order，跳過
    if (!classification.is_order) {
      return {
        processed: true,
        is_order: false,
        message_id: waMessage.id,
        classification: aiClassified,
        confidence: classification.confidence,
      };
    }

    // 5. 是 order → 存入 verification_wa_orders
    const orderDate = classification.order_date
      ? new Date(classification.order_date)
      : new Date();

    // 檢查同一天是否已有 order（版本管理）
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
        wa_order_msg_id: waMessage.id,
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

    // 6. 存入 order items
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
        })),
      });
    }

    // 7. 同步到 verification_records 用於交叉比對
    await this.syncToVerificationRecords(waOrder.id, classification, orderDate, sender);

    return {
      processed: true,
      is_order: true,
      message_id: waMessage.id,
      order_id: waOrder.id,
      order_date: classification.order_date,
      version,
      item_count: classification.items.length,
      leave_count: classification.leave_list.length,
      confidence: classification.confidence,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // AI 分類和解析
  // ══════════════════════════════════════════════════════════════
  private async classifyAndParseMessage(text: string): Promise<AiClassification> {
    const systemPrompt = `你是一個專門分析香港建築運輸公司 WhatsApp 群組訊息的 AI 助手。
你的任務是：
1. 判斷訊息是否為「工作分配 order」（落 order）
2. 如果是 order，解析出結構化數據

## 什麼是 order（工作分配）
- 包含日期（如 2-4-2026）和多個工作分配項目
- 運輸工作分配：客戶/合約 + 路線 + 司機花名 + 車牌
- 管工/雜項人員分配：地盤/合約 + 工作描述 + 人員名字
- 機械調配：合約 + DC 機械編號 + 操作員
- 通常有多行，結構化的工作安排

## 什麼不是 order
- 一般對話、回覆、確認
- 單句通知（如「收到」「OK」「明白」）
- 臨時短訊（如「麻煩各位今日 XB6673 擺番D仔」）
- emoji 反應
- 少於 3 行的短訊息通常不是完整 order

## Order 類型
- transport: 運輸工作（有車牌和司機）
- manpower: 管工/雜項人員分配（有人員名字和工作地點）
- machinery: 機械調配（有 DC 編號）
- notice: 臨時通知
- leave: 請假

## 重要格式特徵
- 日期格式：D-M-YYYY 或 D-M-YYYY（星期X）或 D-M-YYYY(暫定)
- 「暫定」表示暫定版本，「更新」表示更新版本
- 「暫停」表示該工作項目暫停
- [飛仔寫: xxx] 表示飛仔上要寫的客戶名
- 車牌格式：2-3個英文字母 + 數字（如 WY8724, XF2103, EM987）
- 機械編號：DC + 數字（如 DC14, DC20）
- 合約號：如 T24W019, T22M241, PA13114, 3802 等
- 司機用花名/暱稱（如 峰仔、肥洪、隆、旋、棋、偉、文仔）

請以 JSON 格式回覆（不要加 markdown 代碼塊標記）：
{
  "is_order": true/false,
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
      return JSON.parse(cleaned);
    } catch (parseError) {
      this.logger.warn(`Failed to parse AI response: ${cleaned.substring(0, 200)}`);
      // 回退：當作非 order
      return {
        is_order: false,
        confidence: 0,
        is_update: false,
        order_status: 'tentative',
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
    // 找到 whatsapp_order source
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'whatsapp_order' },
    });
    if (!source) {
      this.logger.warn('whatsapp_order source not found, skipping sync to verification_records');
      return;
    }

    // 建立批次
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

    // 為每個有車牌或員工的 item 建立 verification_record
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
  // 取得 WhatsApp Orders 列表
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
  // 取得單筆 WhatsApp Order 詳情
  // ══════════════════════════════════════════════════════════════
  async getWhatsappOrderDetail(orderId: number) {
    const order = await this.prisma.verificationWaOrder.findUnique({
      where: { id: orderId },
      include: {
        message: true,
        items: {
          orderBy: { wa_item_seq: 'asc' },
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
