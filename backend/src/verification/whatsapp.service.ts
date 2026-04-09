import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';

// ══════════════════════════════════════════════════════════════
// 介面定義
// ══════════════════════════════════════════════════════════════

interface ParsedOrderItem {
  seq: number;
  // order_type: 分類
  // - transport: 泥車/運輸（司機+車牌）
  // - manpower: 工程部員工（員工花名列表）
  // - machinery: 機械調配（DC 編號+操作員）
  // - notice: 臨時通知
  // - leave: 請假
  order_type: 'transport' | 'manpower' | 'machinery' | 'notice' | 'leave';
  contract_no?: string;
  customer?: string;
  work_description?: string;
  location?: string;
  // transport 類型：司機花名
  driver_nickname?: string;
  // transport 類型：車牌
  vehicle_no?: string;
  // machinery 類型：DC 機械編號（統一格式 "DC14"）
  machine_code?: string;
  // manpower 類型：帶隊人/負責人（括號內的人名）
  team_leader?: string;
  // manpower 類型：員工花名列表（頓號分隔）
  staff_list?: string[];
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
  target_date?: string;
  target_vehicle_no?: string;
  target_driver_nickname?: string;
  target_machine_code?: string;
  target_contract_no?: string;
  target_description?: string;
  new_driver_nickname?: string;
  new_vehicle_no?: string;
  new_items?: ParsedOrderItem[];
  description: string;
  confidence: number;
}

// ── Daily Summary 介面 ──────────────────────────────────────

export interface DailySummaryItem {
  id: number;
  seq: number;
  contract_no: string | null;
  customer: string | null;
  work_description: string | null;
  location: string | null;
  driver_nickname: string | null;
  vehicle_no: string | null;
  machine_code: string | null;
  contact_person: string | null;
  slip_write_as: string | null;
  is_suspended: boolean;
  remarks: string | null;
  mod_status: string | null; // cancelled | reassigned | suspended | added | null
  mod_prev_data: any | null;
  mod_logs: Array<{
    id: number;
    mod_type: string;
    mod_description: string;
    mod_prev_value: any;
    mod_new_value: any;
    mod_ai_confidence: number | null;
    mod_created_at: string;
    message: {
      wa_msg_body: string | null;
      wa_msg_sender_name: string | null;
      wa_msg_timestamp: string | null;
    } | null;
  }>;
  source_order_id: number;
  source_order_version: number;
}

export interface DailySummary {
  date: string; // YYYY-MM-DD
  latest_status: string; // tentative | confirmed
  total_items: number;
  active_items: number; // items not cancelled
  cancelled_items: number;
  suspended_items: number;
  reassigned_items: number;
  added_items: number;
  versions: Array<{
    version: number;
    status: string;
    sender: string | null;
    item_count: number;
    ai_confidence: number | null;
    created_at: string;
  }>;
  items: DailySummaryItem[];
  messages: Array<{
    id: number;
    sender: string | null;
    body: string | null;
    classification: string | null;
    confidence: number | null;
    timestamp: string | null;
  }>;
  order_mod_logs: Array<{
    id: number;
    mod_type: string;
    mod_description: string;
    mod_created_at: string;
    message: {
      wa_msg_body: string | null;
      wa_msg_sender_name: string | null;
      wa_msg_timestamp: string | null;
    } | null;
  }>;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly openai: OpenAI;

  // ── Bot 狀態（記憶體快取，重啟後重置為 unknown）──────────────
  private botStatus: 'connected' | 'disconnected' = 'disconnected';
  private lastHeartbeatAt: Date | null = null;
  private lastMessageAt: Date | null = null;
  private botUptime: number | null = null;
  private latestQrCode: string | null = null;
  private latestQrCodeAt: Date | null = null;

  // 心跳超時閾值（毫秒）
  private readonly HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘
  // QR code 有效期（毫秒）
  private readonly QR_CODE_TTL_MS = 60 * 1000; // 60 秒

  constructor(private readonly prisma: PrismaService) {
    this.openai = new OpenAI();
  }

  // ══════════════════════════════════════════════════════════════
  // Bot 狀態管理
  // ══════════════════════════════════════════════════════════════

  /**
   * 記錄心跳
   * 由 WhatsApp bot 定期呼叫（建議每 60 秒一次）
   */
  async recordHeartbeat(payload: {
    status: 'connected' | 'disconnected';
    uptime?: number;
    lastMessageAt?: string;
  }) {
    this.botStatus = payload.status;
    this.lastHeartbeatAt = new Date();
    this.botUptime = payload.uptime ?? null;

    if (payload.lastMessageAt) {
      this.lastMessageAt = new Date(payload.lastMessageAt);
    }

    // 連線成功後清除 QR code
    if (payload.status === 'connected') {
      this.latestQrCode = null;
      this.latestQrCodeAt = null;
    }

    this.logger.log(`Heartbeat received: status=${payload.status}, uptime=${payload.uptime}`);

    return {
      received: true,
      server_time: new Date().toISOString(),
    };
  }

  /**
   * 儲存 QR Code
   * 當 bot 斷線需要重新掃碼時，bot 會發送 QR code 數據
   */
  async saveQrCode(qrCode: string) {
    this.latestQrCode = qrCode;
    this.latestQrCodeAt = new Date();

    this.logger.log(`QR code received (length=${qrCode.length})`);

    return {
      saved: true,
      saved_at: this.latestQrCodeAt.toISOString(),
    };
  }

  /**
   * 取得 Bot 連線狀態
   * 前端用來顯示連線指示器
   */
  async getBotStatus() {
    const now = new Date();
    let effectiveStatus: 'connected' | 'disconnected' | 'unknown' = 'unknown';
    let offlineDurationMs: number | null = null;

    if (this.lastHeartbeatAt) {
      const msSinceLastHeartbeat = now.getTime() - this.lastHeartbeatAt.getTime();

      if (this.botStatus === 'connected' && msSinceLastHeartbeat <= this.HEARTBEAT_TIMEOUT_MS) {
        effectiveStatus = 'connected';
      } else {
        effectiveStatus = 'disconnected';
        // 離線時長：從最後一次心跳開始計算
        offlineDurationMs = msSinceLastHeartbeat;
      }
    }
    // 如果從未收到心跳，保持 'unknown'

    // 檢查是否有有效的 QR code
    let hasQrCode = false;
    if (this.latestQrCode && this.latestQrCodeAt) {
      const qrAge = now.getTime() - this.latestQrCodeAt.getTime();
      hasQrCode = qrAge <= this.QR_CODE_TTL_MS;
    }

    return {
      status: effectiveStatus,
      reported_status: this.botStatus,
      last_heartbeat_at: this.lastHeartbeatAt?.toISOString() || null,
      last_message_at: this.lastMessageAt?.toISOString() || null,
      uptime: this.botUptime,
      offline_duration_ms: offlineDurationMs,
      has_qr_code: hasQrCode,
      server_time: now.toISOString(),
    };
  }

  /**
   * 取得最新 QR Code
   * 前端用來顯示掃碼重連介面
   */
  async getQrCode() {
    const now = new Date();

    if (!this.latestQrCode || !this.latestQrCodeAt) {
      return {
        available: false,
        qr_code: null,
        generated_at: null,
        expired: false,
      };
    }

    const qrAge = now.getTime() - this.latestQrCodeAt.getTime();
    const expired = qrAge > this.QR_CODE_TTL_MS;

    return {
      available: !expired,
      qr_code: expired ? null : this.latestQrCode,
      generated_at: this.latestQrCodeAt.toISOString(),
      expired,
      age_ms: qrAge,
    };
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
    let result: any;
    switch (classification.message_type) {
      case 'order':
        result = await this.handleOrder(waMessage.id, classification, sender, text);
        break;

      case 'modification':
        result = await this.handleModification(waMessage.id, classification, sender, text);
        break;

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

    // 5. 處理完 order 或 modification 後，同步每日總結到 verification_records
    const targetDate = classification.order_date
      || (classification.modifications?.[0]?.target_date)
      || new Date().toISOString().slice(0, 10);
    await this.syncDailySummaryToVerificationRecords(targetDate);

    return result;
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
    const dateStart = new Date(orderDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(orderDate);
    dateEnd.setHours(23, 59, 59, 999);

    const existingOrders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
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
          // transport: 司機花名; manpower: 帶隊人
          wa_item_driver_nickname: item.driver_nickname || item.team_leader || null,
          wa_item_driver_id: null,
          wa_item_vehicle_no: item.vehicle_no || null,
          wa_item_machine_code: item.machine_code || null,
          wa_item_contact_person: item.contact_person || null,
          wa_item_slip_write_as: item.slip_write_as || null,
          wa_item_is_suspended: item.is_suspended || false,
          // manpower: staff_list 序列化存入 remarks（格式: "[staff]員工: 小明,小紅\n備註: xxx"）
          wa_item_remarks: (
            item.staff_list && item.staff_list.length > 0
              ? `[staff]員工: ${item.staff_list.join(', ')}${item.remarks ? '\n' + item.remarks : ''}`
              : item.remarks || null
          ),
          wa_item_mod_status: null,
          wa_item_mod_prev_data: undefined,
        })),
      });
    }

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
    _text: string,
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
    _sender: string,
  ) {
    const targetDate = mod.target_date ? new Date(mod.target_date) : new Date();
    const dateStart = new Date(targetDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    const latestOrder = await this.prisma.verificationWaOrder.findFirst({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
      },
      orderBy: { wa_order_version: 'desc' },
      include: { items: true },
    });

    if (!latestOrder) {
      return {
        success: false,
        reason: 'no_order_found',
        target_date: mod.target_date,
        description: mod.description,
      };
    }

    if (mod.mod_type === 'add') {
      return this.applyAddModification(messageId, latestOrder, mod);
    }

    const matchedItems = this.findMatchingItems(latestOrder.items, mod);

    if (matchedItems.length === 0) {
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
      if (mod.target_vehicle_no && item.wa_item_vehicle_no) {
        const normalizedTarget = mod.target_vehicle_no.replace(/\s/g, '').toUpperCase();
        const normalizedItem = item.wa_item_vehicle_no.replace(/\s/g, '').toUpperCase();
        if (normalizedTarget === normalizedItem) return true;
      }
      if (mod.target_driver_nickname && item.wa_item_driver_nickname) {
        const targetNick = mod.target_driver_nickname.trim().toLowerCase();
        const itemNick = item.wa_item_driver_nickname.trim().toLowerCase();
        if (targetNick === itemNick || itemNick.includes(targetNick) || targetNick.includes(itemNick)) return true;
      }
      if (mod.target_machine_code && item.wa_item_machine_code) {
        const normalizedTarget = mod.target_machine_code.replace(/\s/g, '').toUpperCase();
        const normalizedItem = item.wa_item_machine_code.replace(/\s/g, '').toUpperCase();
        if (normalizedTarget === normalizedItem) return true;
      }
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
    const prevSnapshot: Record<string, any> = {
      wa_item_driver_nickname: item.wa_item_driver_nickname,
      wa_item_vehicle_no: item.wa_item_vehicle_no,
      wa_item_machine_code: item.wa_item_machine_code,
      wa_item_is_suspended: item.wa_item_is_suspended,
      wa_item_mod_status: item.wa_item_mod_status,
    };

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
        updateData.wa_item_mod_status = null;
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

    await this.prisma.verificationWaOrderItem.update({
      where: { id: item.id },
      data: updateData,
    });

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
    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `你是一個專門分析香港建築運輸公司 WhatsApp 群組訊息的 AI 助手。
你的任務是：
1. 判斷訊息屬於哪種類型：order（完整工作分配）、modification（修改指令）、chat（一般對話）
2. 根據類型解析出結構化數據

## 訊息類型判斷

### order（完整工作分配）
包含日期 + 多個工作分配項目，有三種子格式：

**A. 機械 order**（以 DC 機械編號為主）
- 以合約號分組（如 T24w022、PA13114、3802、3310WH-X451）
- DC + 數字 = 機械編號，可能有空格（DC 14、D C13、DC06 都是同一種，統一為 DC14）
- DC 編號後緊跟操作員花名（如 DC07泉、DC15強、DC10～平哥）
- 「～暫停」或「暫停」= 該合約或機械暫停
- 只有機械編號 + 停放位置（如「DC17 DC05 係3跑西架步」）= 閒置/待命機械
- 客戶分組標題如「1:明達」表示後續項目屬於該客戶
- 雜項：維修保養、安全機械、請假等

**B. 工程部員工 order**（以員工花名列表為主）
- 用中文/數字序號分組（一、二、三 或 1:、2:、3:）
- 每組格式：序號：工作描述 + 員工花名（頓號「、」分隔）
- 括號內可能是帶隊人（如「機場帮手什务(涛哥) 雄、區」→ 帶隊人:涛哥，員工:雄、區）
- 可能有合約號（如 PA13114南落石矢）
- 「暫停」= 該工作暫停
- 這種 order 的 order_type 為 "manpower"

**C. 泥車/運輸 order**（以司機+車牌為主）
- 客戶名-合約號在最前（如「金門 3802 月租車」「榮興-T22M241 [20噸]」「惠興-丹桂一期租車」）
- 路線/工作描述在下面
- 司機花名 + 車牌號碼一行一組（如「區 EM987」「峰 JR981」）
- 車牌格式：2-3個英文字母 + 數字（EM987、XF2103、WY987、UH1883、JR981、YT6383 等）
- 聯絡人電話在「聯絡人：」或「聯絡:」後面
- emoji（⬅️➡️☎️⬅️）要忽略
- 星號包圍的（*明達泥尾飛記得影相*）= 提醒/備註
- 「休息：隆/沙曾」= 休息人員，加入 leave_list
- 「暫停」= 該工作暫停
- 同一客戶可能有多個不同路線，每條路線是一個獨立 item
- 這種 order 的 order_type 為 "transport"

### modification（修改指令）
針對已有 order 的局部修改（短訊息，包含動作詞）：
- 取消：「明天 CJ591 取消」「XX車唔使去」
- 換人/換車：「陳大文請假，改派李小明」
- 暫停：「三跑 DC18 暫停一日」
- 恢復：「DC18 照做」
- 新增：「加多一架車去觀塘」

### chat（一般對話）
確認回覆（收到/OK）、emoji、閒聊等。

## 修改類型 (mod_type)
- cancel: 取消某項工作
- reassign: 換人或換車
- suspend: 暫停某項工作
- resume: 恢復已暫停的工作
- add: 新增工作項目
- other: 其他修改

## 日期處理
- 日期格式：D-M-YYYY 或 D-M-YYYY(暫定) 或 D-M-YYYY（星期X）暫定/更新
- 全形數字（４）= 半形數字（4）
- 「暫定」→ order_status: "tentative"；「更新」→ is_update: true, order_status: "confirmed"
- 「明天」「聽日」「今日」等相對日期基於今天 ${today}

## 回覆格式（JSON，不加 markdown 代碼塊）

如果是 order：
{
  "message_type": "order",
  "confidence": 0.0-1.0,
  "order_date": "YYYY-MM-DD",
  "is_update": true/false,
  "order_status": "tentative" 或 "confirmed",
  "items": [
    {
      "seq": 1,
      "order_type": "transport" 或 "manpower" 或 "machinery" 或 "notice" 或 "leave",
      "contract_no": "合約號或null",
      "customer": "客戶名或null",
      "work_description": "工作描述或null",
      "location": "地點/路線或null",
      "driver_nickname": "司機花名或null（transport 用）",
      "vehicle_no": "車牌或null（transport 用，如 EM987）",
      "machine_code": "DC機械編號或null（machinery 用，統一格式如 DC14）",
      "team_leader": "帶隊人花名或null（manpower 用，括號內的人）",
      "staff_list": ["員工1", "員工2"] 或 null（manpower 用，頓號分隔的員工列表）,
      "contact_person": "聯絡人資訊或null（含電話）",
      "slip_write_as": "飛仔寫什麼或null",
      "is_suspended": true/false,
      "remarks": "備註或null（星號提醒、跟人規矩等）"
    }
  ],
  "leave_list": ["請假/休息人員1", "請假/休息人員2"],
  "raw_summary": "簡短摘要"
}

如果是 modification：
{
  "message_type": "modification",
  "confidence": 0.0-1.0,
  "modifications": [
    {
      "mod_type": "cancel/reassign/suspend/resume/add/other",
      "target_date": "YYYY-MM-DD 或 null",
      "target_vehicle_no": "目標車牌或null",
      "target_driver_nickname": "目標司機花名或null",
      "target_machine_code": "目標機械編號或null",
      "target_contract_no": "目標合約號或null",
      "target_description": "目標描述或null",
      "new_driver_nickname": "新司機花名或null",
      "new_vehicle_no": "新車牌或null",
      "new_items": [],
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
    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.is_order !== undefined && !parsed.message_type) {
        parsed.message_type = parsed.is_order ? 'order' : 'chat';
      }
      return parsed;
    } catch (_parseError) {
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
  // 每日 Order 總結 — 核心方法
  // 合併同一天所有 order 版本 + modification，產生最終版本
  // ══════════════════════════════════════════════════════════════
  async getDailySummary(dateStr: string): Promise<DailySummary | null> {
    const dateStart = new Date(dateStr);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStr);
    dateEnd.setHours(23, 59, 59, 999);

    // 取得該天所有 order（按版本排序）
    const orders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
      },
      include: {
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
          where: { mod_item_id: null }, // order-level logs only
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
      orderBy: { wa_order_version: 'asc' },
    });

    if (orders.length === 0) return null;

    // 取最新版本的 order 作為基礎（它的 items 已經包含 modification 後的最新狀態）
    const latestOrder = orders[orders.length - 1];

    // 收集所有版本的 items（最新版為主，但也包含之前版本新增的 items）
    // 策略：以最新版 order 的 items 為準，因為 modification 已經直接修改了 items
    const summaryItems: DailySummaryItem[] = latestOrder.items.map((item) => ({
      id: item.id,
      seq: item.wa_item_seq,
      contract_no: item.wa_item_contract_no,
      customer: item.wa_item_customer,
      work_description: item.wa_item_work_desc,
      location: item.wa_item_location,
      driver_nickname: item.wa_item_driver_nickname,
      vehicle_no: item.wa_item_vehicle_no,
      machine_code: item.wa_item_machine_code,
      contact_person: item.wa_item_contact_person,
      slip_write_as: item.wa_item_slip_write_as,
      is_suspended: item.wa_item_is_suspended,
      remarks: item.wa_item_remarks,
      mod_status: item.wa_item_mod_status,
      mod_prev_data: item.wa_item_mod_prev_data,
      mod_logs: item.mod_logs.map((log) => ({
        id: log.id,
        mod_type: log.mod_type,
        mod_description: log.mod_description,
        mod_prev_value: log.mod_prev_value,
        mod_new_value: log.mod_new_value,
        mod_ai_confidence: log.mod_ai_confidence ? Number(log.mod_ai_confidence) : null,
        mod_created_at: log.mod_created_at.toISOString(),
        message: log.message
          ? {
              wa_msg_body: log.message.wa_msg_body,
              wa_msg_sender_name: log.message.wa_msg_sender_name,
              wa_msg_timestamp: log.message.wa_msg_timestamp?.toISOString() || null,
            }
          : null,
      })),
      source_order_id: latestOrder.id,
      source_order_version: latestOrder.wa_order_version,
    }));

    // 統計
    const cancelledCount = summaryItems.filter((i) => i.mod_status === 'cancelled').length;
    const suspendedCount = summaryItems.filter((i) => i.mod_status === 'suspended' || (i.is_suspended && i.mod_status !== 'cancelled')).length;
    const reassignedCount = summaryItems.filter((i) => i.mod_status === 'reassigned').length;
    const addedCount = summaryItems.filter((i) => i.mod_status === 'added').length;
    const activeCount = summaryItems.filter((i) => i.mod_status !== 'cancelled').length;

    // 取得該天所有相關訊息
    const messageIds = orders.map((o) => o.wa_order_msg_id).filter((id): id is number => id !== null);
    // Also get modification messages from mod_logs
    const allModLogs = orders.flatMap((o) => o.mod_logs);
    const modMsgIds = allModLogs.map((l) => l.mod_msg_id);
    const allMsgIds = [...new Set([...messageIds, ...modMsgIds])];

    const messages = allMsgIds.length > 0
      ? await this.prisma.verificationWaMessage.findMany({
          where: { id: { in: allMsgIds } },
          orderBy: { wa_msg_timestamp: 'asc' },
        })
      : [];

    // 收集 order-level 修改日誌
    const orderModLogs = orders.flatMap((o) =>
      o.mod_logs.map((log) => ({
        id: log.id,
        mod_type: log.mod_type,
        mod_description: log.mod_description,
        mod_created_at: log.mod_created_at.toISOString(),
        message: log.message
          ? {
              wa_msg_body: log.message.wa_msg_body,
              wa_msg_sender_name: log.message.wa_msg_sender_name,
              wa_msg_timestamp: log.message.wa_msg_timestamp?.toISOString() || null,
            }
          : null,
      })),
    );

    return {
      date: dateStr,
      latest_status: latestOrder.wa_order_status,
      total_items: summaryItems.length,
      active_items: activeCount,
      cancelled_items: cancelledCount,
      suspended_items: suspendedCount,
      reassigned_items: reassignedCount,
      added_items: addedCount,
      versions: orders.map((o) => ({
        version: o.wa_order_version,
        status: o.wa_order_status,
        sender: o.wa_order_sender_name,
        item_count: o.wa_order_item_count,
        ai_confidence: o.wa_order_ai_confidence ? Number(o.wa_order_ai_confidence) : null,
        created_at: o.wa_order_created_at.toISOString(),
      })),
      items: summaryItems,
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.wa_msg_sender_name,
        body: m.wa_msg_body,
        classification: m.wa_msg_ai_classified,
        confidence: m.wa_msg_ai_confidence ? Number(m.wa_msg_ai_confidence) : null,
        timestamp: m.wa_msg_timestamp?.toISOString() || null,
      })),
      order_mod_logs: orderModLogs,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 取得多天的每日 Order 總結列表
  // ══════════════════════════════════════════════════════════════
  async getDailySummaries(query: {
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { date_from, date_to, search, page = 1, limit = 20 } = query;

    // 先找出有 order 的日期
    const where: any = {};
    if (date_from || date_to) {
      where.wa_order_date = {};
      if (date_from) where.wa_order_date.gte = new Date(date_from);
      if (date_to) where.wa_order_date.lte = new Date(date_to);
    }

    const allOrders = await this.prisma.verificationWaOrder.findMany({
      where,
      select: { wa_order_date: true },
      orderBy: { wa_order_date: 'desc' },
    });

    // 取得不重複的日期
    const uniqueDates = [...new Set(
      allOrders.map((o) => o.wa_order_date.toISOString().slice(0, 10)),
    )].sort((a, b) => b.localeCompare(a)); // 最新日期在前

    // 產生每天的總結
    const summaries: DailySummary[] = [];
    for (const dateStr of uniqueDates) {
      const summary = await this.getDailySummary(dateStr);
      if (!summary) continue;

      // 搜尋過濾
      if (search) {
        const s = search.toLowerCase();
        const matchesSearch = summary.items.some(
          (item) =>
            (item.vehicle_no && item.vehicle_no.toLowerCase().includes(s)) ||
            (item.driver_nickname && item.driver_nickname.toLowerCase().includes(s)) ||
            (item.customer && item.customer.toLowerCase().includes(s)) ||
            (item.contract_no && item.contract_no.toLowerCase().includes(s)) ||
            (item.machine_code && item.machine_code.toLowerCase().includes(s)) ||
            (item.location && item.location.toLowerCase().includes(s)) ||
            (item.work_description && item.work_description.toLowerCase().includes(s)),
        );
        if (!matchesSearch) continue;
      }

      summaries.push(summary);
    }

    const total = summaries.length;
    const paged = summaries.slice((page - 1) * limit, page * limit);

    return {
      data: paged,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════
  // 同步每日總結到 verification_records（用於六來源交叉比對）
  // 每次有新 order 或 modification 時調用
  // ══════════════════════════════════════════════════════════════
  private async syncDailySummaryToVerificationRecords(dateStr: string) {
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'whatsapp_order' },
    });
    if (!source) {
      this.logger.warn('whatsapp_order source not found, skipping sync');
      return;
    }

    const summary = await this.getDailySummary(dateStr);
    if (!summary) return;

    // 刪除該日期的舊 verification_records（whatsapp_order 來源）
    const existingBatches = await this.prisma.verificationBatch.findMany({
      where: {
        batch_source_id: source.id,
        batch_code: { startsWith: `BATCH-${dateStr}-whatsapp_order-summary` },
      },
      select: { id: true },
    });

    if (existingBatches.length > 0) {
      const batchIds = existingBatches.map((b) => b.id);
      await this.prisma.verificationRecord.deleteMany({
        where: { record_batch_id: { in: batchIds } },
      });
      await this.prisma.verificationBatch.deleteMany({
        where: { id: { in: batchIds } },
      });
    }

    // 只同步活躍的項目（非取消的）
    const activeItems = summary.items.filter((item) => item.mod_status !== 'cancelled');
    const transportItems = activeItems.filter(
      (item) => item.vehicle_no || item.driver_nickname || item.machine_code,
    );

    if (transportItems.length === 0) return;

    const orderDate = new Date(dateStr);
    const batchCode = `BATCH-${dateStr}-whatsapp_order-summary`;

    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: `WhatsApp Daily Summary ${dateStr}`,
        batch_total_rows: transportItems.length,
        batch_filtered_rows: transportItems.length,
        batch_status: 'completed',
      },
    });

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

  // ══════════════════════════════════════════════════════════════
  // 取得每日總結的 items（供 matching service 使用）
  // ══════════════════════════════════════════════════════════════
  async getDailySummaryItemsForMatching(dateFrom: Date, dateTo: Date) {
    const dateStart = new Date(dateFrom);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateTo);
    dateEnd.setHours(23, 59, 59, 999);

    // 取得日期範圍內所有 order，按日期和版本排序
    const orders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
      },
      include: {
        items: true,
      },
      orderBy: [{ wa_order_date: 'asc' }, { wa_order_version: 'desc' }],
    });

    // 每天只取最新版本
    const latestByDate = new Map<string, typeof orders[0]>();
    for (const order of orders) {
      const dateKey = order.wa_order_date.toISOString().slice(0, 10);
      if (!latestByDate.has(dateKey) || order.wa_order_version > latestByDate.get(dateKey)!.wa_order_version) {
        latestByDate.set(dateKey, order);
      }
    }

    // 展平為 items，排除已取消的
    return Array.from(latestByDate.values()).flatMap((o) =>
      o.items
        .filter((item) => item.wa_item_mod_status !== 'cancelled')
        .map((item) => ({
          ...item,
          order_date: o.wa_order_date.toISOString().slice(0, 10),
          order_status: o.wa_order_status,
          order_version: o.wa_order_version,
        })),
    );
  }

  // ══════════════════════════════════════════════════════════════
  // 保留的舊 API（向後兼容）
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
      orderBy: [{ wa_order_date: 'desc' }, { wa_order_version: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: orders,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }

  async getWhatsappOrderDetail(orderId: number) {
    return this.prisma.verificationWaOrder.findUnique({
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
  }

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
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
    };
  }
}
