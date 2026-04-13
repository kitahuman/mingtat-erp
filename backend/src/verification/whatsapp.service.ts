import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { createOpenAIClient } from '../common/openai-client';
import { NicknameMatchService } from './nickname-match.service';

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
  product_name?: string;
  product_unit?: string;
  goods_quantity?: number;
  remarks?: string;
}

interface AiClassification {
  message_type: 'order' | 'modification' | 'chat';
  confidence: number;
  order_date?: string; // YYYY-MM-DD
  shift?: 'day' | 'night'; // day (default) or night
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
  order_type: string | null; // machinery | manpower | transport | notice | leave
  contract_no: string | null;
  customer: string | null;
  work_description: string | null;
  location: string | null;
  driver_nickname: string | null;
  driver_id?: number | null;
  driver_name_zh?: string | null;
  vehicle_no: string | null;
  machine_code: string | null;
  contact_person: string | null;
  slip_write_as: string | null;
  is_suspended: boolean;
  product_name: string | null;
  product_unit: string | null;
  goods_quantity: number | null;
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
  shift: string; // day | night
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly nicknameMatchService: NicknameMatchService
  ) {
    this.openai = createOpenAIClient();
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
    const isPendingReview = classification.confidence < 0.6 || 
      (classification.message_type === 'order' && classification.items.length === 0);

    await this.prisma.verificationWaMessage.update({
      where: { id: waMessage.id },
      data: {
        wa_msg_ai_classified: classification.message_type,
        wa_msg_ai_confidence: classification.confidence,
        wa_msg_processed: true,
        wa_msg_pending_review: isPendingReview,
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
    const targetShift = classification.shift || 'day';
    await this.syncDailySummaryToVerificationRecords(targetDate, targetShift);

    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // 重新解析訊息
  // ══════════════════════════════════════════════════════════════
  async reparseMessage(messageId: number) {
    const waMessage = await this.prisma.verificationWaMessage.findUnique({
      where: { id: messageId },
      include: { orders: true, mod_logs: true }
    });

    if (!waMessage || !waMessage.wa_msg_body) {
      throw new Error('Message not found or has no body');
    }

    // Reset state
    await this.prisma.verificationWaMessage.update({
      where: { id: messageId },
      data: {
        wa_msg_ai_classified: null,
        wa_msg_ai_confidence: null,
        wa_msg_processed: false,
        wa_msg_pending_review: false,
        wa_msg_review_result: null,
      }
    });

    // Reprocess
    return this.processWebhookMessage({
      chatId: waMessage.wa_msg_group_id || '',
      sender: waMessage.wa_msg_sender_name || 'Unknown',
      text: waMessage.wa_msg_body,
      groupName: waMessage.wa_msg_group_name || undefined,
    });
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
    const shift = classification.shift || 'day';

    // 版本管理：檢查同一天 + 同一班次是否已有 order
    const dateStart = new Date(orderDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(orderDate);
    dateEnd.setHours(23, 59, 59, 999);

    const existingOrders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
        wa_order_shift: shift,
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
        wa_order_shift: shift,
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
        data: classification.items.map((item, idx) => {
          // 組合 remarks：staff_list + team_leader + 原始 remarks
          const remarkParts: string[] = [];
          if (item.team_leader) remarkParts.push(`[leader]帶隊: ${item.team_leader}`);
          if (item.staff_list && item.staff_list.length > 0) remarkParts.push(`[staff]員工: ${item.staff_list.join('、')}`);
          if (item.remarks) remarkParts.push(item.remarks);
          const combinedRemarks = remarkParts.length > 0 ? remarkParts.join('\n') : null;

          return {
            wa_item_order_id: waOrder.id,
            wa_item_seq: item.seq || idx + 1,
            wa_item_order_type: item.order_type || null,
            wa_item_contract_no: item.contract_no || null,
            wa_item_customer: item.customer || null,
            wa_item_work_desc: item.work_description || null,
            wa_item_location: item.location || null,
            // transport/machinery: 司機/操作員花名; manpower: 帶隊人
            wa_item_driver_nickname: item.driver_nickname || item.team_leader || null,
            wa_item_driver_id: null, // We'll update this in the next step
            wa_item_vehicle_no: item.vehicle_no || null,
            wa_item_machine_code: item.machine_code || null,
            wa_item_contact_person: item.contact_person || null,
            wa_item_slip_write_as: item.slip_write_as || null,
            wa_item_is_suspended: item.is_suspended || false,
            wa_item_product_name: item.product_name || null,
            wa_item_product_unit: item.product_unit || null,
            wa_item_goods_quantity: item.goods_quantity ?? null,
            wa_item_remarks: combinedRemarks,
            wa_item_mod_status: null,
            wa_item_mod_prev_data: undefined,
          };
        }),
      });

      // Match nicknames to employee IDs
      const createdItems = await this.prisma.verificationWaOrderItem.findMany({
        where: { wa_item_order_id: waOrder.id }
      });

      for (const createdItem of createdItems) {
        if (createdItem.wa_item_driver_nickname) {
          const empId = await this.nicknameMatchService.matchNickname(createdItem.wa_item_driver_nickname);
          if (empId) {
            await this.prisma.verificationWaOrderItem.update({
              where: { id: createdItem.id },
              data: { wa_item_driver_id: empId }
            });
          }
        }
      }
    }

    return {
      processed: true,
      message_type: 'order',
      is_order: true,
      message_id: messageId,
      order_id: waOrder.id,
      order_date: classification.order_date,
      shift,
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

    const shift = classification.shift || 'day';

    for (const mod of modifications) {
      try {
        const result = await this.applyModification(messageId, mod, sender, shift);
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
    shift: string = 'day',
  ) {
    const targetDate = mod.target_date ? new Date(mod.target_date) : new Date();
    const dateStart = new Date(targetDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(targetDate);
    dateEnd.setHours(23, 59, 59, 999);

    // 先嘗試找同一班次的 order，找不到則 fallback 到任何班次
    let latestOrder = await this.prisma.verificationWaOrder.findFirst({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
        wa_order_shift: shift,
      },
      orderBy: { wa_order_version: 'desc' },
      include: { items: true },
    });

    if (!latestOrder) {
      latestOrder = await this.prisma.verificationWaOrder.findFirst({
        where: {
          wa_order_date: { gte: dateStart, lte: dateEnd },
        },
        orderBy: { wa_order_version: 'desc' },
        include: { items: true },
      });
    }

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
          
          const empId = await this.nicknameMatchService.matchNickname(mod.new_driver_nickname);
          if (empId) {
            updateData.wa_item_driver_id = empId;
            newSnapshot.wa_item_driver_id = empId;
          } else {
            updateData.wa_item_driver_id = null;
            newSnapshot.wa_item_driver_id = null;
          }
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
          wa_item_driver_id: item.driver_nickname ? await this.nicknameMatchService.matchNickname(item.driver_nickname) : null,
          wa_item_vehicle_no: item.vehicle_no || null,
          wa_item_machine_code: item.machine_code || null,
          wa_item_contact_person: item.contact_person || null,
          wa_item_slip_write_as: item.slip_write_as || null,
          wa_item_is_suspended: item.is_suspended || false,
          wa_item_product_name: item.product_name || null,
          wa_item_product_unit: item.product_unit || null,
          wa_item_goods_quantity: item.goods_quantity ?? null,
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

## ⛔ 絕對不能違反的規則（最高優先級）
1. 每個 item 的 JSON 必須包含 "order_type" 欄位（值為 "machinery"/"manpower"/"transport"/"notice"/"leave"），絕對不能省略！
2. machinery 類型：每個 DC 編號 = 一筆獨立 item，絕對不能把多個 DC 合併成一筆！DC04暫停但DC06不暫停時，必須拆成兩筆，各自有不同的 is_suspended 值。
3. manpower 類型：staff_list 陣列必須包含所有員工花名，一個都不能遺漏！例如「宽、青、黃運、健、家善、高佬、大飛、ADil」= staff_list:["宽","青","黃運","健","家善","高佬","大飛","ADil"]（8個人）。
4. transport 類型：「聯絡人：」「聯絡:」「吾明問/聯絡：」後面的人名+電話是 contact_person，絕對不是 driver_nickname！電話號碼（8位數字）絕對不是 vehicle_no！

## 訊息類型判斷

### order（完整工作分配）
包含日期 + 多個工作分配項目。一條 order 訊息只會是以下三種之一（不會混合）：

**A. 機械 order（order_type: "machinery"）**
特徵：以 DC 機械編號為主
解析規則：
- 以合約號分組（如 T24w022、PA13114、3802、3310WH-X451）
- DC + 數字 = 機械編號，格式不規則（DC 14、D C13、DC06、D C 22），統一為 "DC" + 數字（如 DC14、DC03、DC22）
- DC 編號後面可能緊跟操作員花名（如 DC07泉→機械:DC07 操作員:泉；DC15強→機械:DC15 操作員:強；DC10～平哥→機械:DC10 操作員:平哥）
- ⛔⛔⛔ 每個 DC 編號必須拆成獨立的 item！即使在同一合約下有多個 DC，每個 DC 都是一筆獨立記錄。例如「DC06 DC04～暫停」= 2筆：DC06(is_suspended:false) + DC04(is_suspended:true)
- ⚠️ 重要：如果合約整體標記「暫停」，該合約下所有 DC 的 is_suspended 都為 true
- ⛔⛔⛔ 如果個別 DC 標記「暫停」（如 DC04～暫停），只有該 DC 的 is_suspended 為 true，同合約其他 DC 的 is_suspended 為 false
- 只有機械編號 + 停放位置、沒有合約號和工作描述的（如「DC17 DC05 DC12 DC11 DC18 係3跑西架步」）= 閒置/待命機械，order_type 設為 "machinery"，work_description 設為 "閒置/待命"，location 設為停放位置
- 客戶分組標題如「1:明達」表示後續項目屬於該客戶
- 「安全、機械～雜項～」= 雜項，order_type: "notice"
- 「維修保養」= 維修，order_type: "notice"
- 「請假～文傑～」= 請假，加入 leave_list

範例解析：
原文：T24w022 飛機扣X4位 DC 14 DC 20 DC 03 X 4位完工
→ 3 個 items：
  {seq:1, order_type:"machinery", contract_no:"T24w022", work_description:"飛機扣X4位", machine_code:"DC14", remarks:"X 4位完工"}
  {seq:2, order_type:"machinery", contract_no:"T24w022", work_description:"飛機扣X4位", machine_code:"DC20", remarks:"X 4位完工"}
  {seq:3, order_type:"machinery", contract_no:"T24w022", work_description:"飛機扣X4位", machine_code:"DC03", remarks:"X 4位完工"}

原文：PA13114新位剃頭 出草頭 DC06 DC04～暫停
→ 2 個 items：
  {seq:1, order_type:"machinery", contract_no:"PA13114", work_description:"新位剃頭 出草頭", machine_code:"DC06", is_suspended:false}
  {seq:2, order_type:"machinery", contract_no:"PA13114", work_description:"新位剃頭 出草頭", machine_code:"DC04", is_suspended:true}

原文：3802(3跑東面金門地盤) 租機 DC07泉 DC15強 DC08平 DC02肥仔麟
→ 4 個 items：
  {seq:1, order_type:"machinery", contract_no:"3802", customer:"金門", location:"3跑東面金門地盤", work_description:"租機", machine_code:"DC07", driver_nickname:"泉"}
  {seq:2, order_type:"machinery", contract_no:"3802", customer:"金門", location:"3跑東面金門地盤", work_description:"租機", machine_code:"DC15", driver_nickname:"強"}
  {seq:3, order_type:"machinery", contract_no:"3802", customer:"金門", location:"3跑東面金門地盤", work_description:"租機", machine_code:"DC08", driver_nickname:"平"}
  {seq:4, order_type:"machinery", contract_no:"3802", customer:"金門", location:"3跑東面金門地盤", work_description:"租機", machine_code:"DC02", driver_nickname:"肥仔麟"}

原文：DC17 DC05 DC12 DC11 DC18 係3跑西架步
→ 5 個 items（閒置/待命）：
  {seq:1, order_type:"machinery", work_description:"閒置/待命", machine_code:"DC17", location:"3跑西架步"}
  ... 每個 DC 一筆

**B. 工程部員工 order（order_type: "manpower"）**
特徵：以員工花名列表為主，用中文/數字序號分組
解析規則：
- 用中文序號（一、二、三、四...）或數字序號（1:、2:、3:...）分組
- 每組格式：序號：[合約號][工作描述] [員工花名列表]
- 員工花名用頓號「、」分隔
- 括號內的人名是帶隊人（如「機場帮手什务(涛哥) 雄、區」→ team_leader:"涛哥", staff_list:["雄","區"]）
- ⛔⛔⛔ staff_list 必須是完整的 JSON 陣列，包含所有用頓號「、」分隔的員工花名，一個都不能遺漏！例如「宽、青、黃運、健、家善、高佬、大飛、ADil」→ staff_list:["宽","青","黃運","健","家善","高佬","大飛","ADil"]
- 合約號可能緊跟在工作描述前面（如 PA13114南落石矢 → contract_no:"PA13114", work_description:"南落石矢"）
- 「暫停」= is_suspended: true
- 每個序號組是一個 item

範例解析：
原文：
一：潭尾vo 暫停
二：機場帮手什务(涛哥) 雄、區
三：PA13114南落石矢 宽、青、黃運、健、家善、高佬、大飛、ADil
四：頂替司機 峰仔
→ 4 個 items：
  {seq:1, order_type:"manpower", work_description:"潭尾vo", is_suspended:true, staff_list:null}
  {seq:2, order_type:"manpower", work_description:"機場帮手什务", location:"機場", team_leader:"涛哥", staff_list:["雄","區"], is_suspended:false}
  {seq:3, order_type:"manpower", contract_no:"PA13114", work_description:"南落石矢", staff_list:["宽","青","黃運","健","家善","高佬","大飛","ADil"], is_suspended:false}
  {seq:4, order_type:"manpower", work_description:"頂替司機", staff_list:["峰仔"], is_suspended:false}

**C. 泥車/運輸 order（order_type: "transport"）**
特徵：以司機花名 + 車牌號碼為主
解析規則：
- 客戶名-合約號在最前（如「金門 3802 月租車」「榮興-T22M241 [20噸]」「惠興-丹桂一期租車」）
- 路線/工作描述在客戶行下面
- 司機花名 + 車牌號碼一行一組（如「區 EM987」「峰 JR981」「肥洪 UH1883」）
- ⛔⛔⛔ 車牌格式是 2-3 個英文字母 + 3-4 個數字（如 EM987、XF2103、WY987、UH1883、JR981、YT6383、WP7366、ZY4778、ER991、WC987、WY440、TF3306、YE6679）。只有符合此格式的才是車牌！
- ⛔⛔⛔ 一個司機+車牌 = 一筆獨立 item！同一客戶下多個司機要拆成多筆
- ⛔⛔⛔ 「聯絡人：」「聯絡:」「吾明問/聯絡：」後面的是聯絡人和電話，絕對不是司機！存入 contact_person 欄位，不要存入 driver_nickname！
  例如「聯絡人：峰哥 60176557 做圍網」→ contact_person:"峰哥 60176557 做圍網"（峰哥不是司機！60176557不是車牌！）
  例如「聯絡: 勇仔 9279 4462」→ contact_person:"勇仔 9279 4462"（勇仔不是司機！）
  例如「吾明問/聯絡：細昌 9095 5458」→ contact_person:"細昌 9095 5458"（細昌不是司機！）
- ⛔⛔⛔ 電話號碼（8位純數字如 60176557、92794462、94529852、91609160）絕對不是車牌！車牌格式是英文字母+數字（如 EM987、WY440），電話是純數字或有空格的數字（如 9279 4462）
- ⚠️ 重要：「台號：143800」是台號，不是車牌，存入 remarks
- emoji（⬅️➡️☎️）要忽略
- 星號包圍的（*明達泥尾飛記得影相*）= 提醒/備註，存入 remarks
- 「休息：隆/沙曾」= 休息人員，加入 leave_list（不是 item）
- 「暫停」= is_suspended: true
- 同一客戶可能有多個不同路線/工作，每條路線下的每個司機+車牌是獨立 item
- 聯絡人資訊附加到同一工作組的所有 items 的 contact_person 欄位

範例解析：
原文：
金門 3802 月租車
區 EM987
→ 1 個 item：
  {seq:1, order_type:"transport", customer:"金門", contract_no:"3802", work_description:"月租車", driver_nickname:"區", vehicle_no:"EM987"}

原文：
金門 3802租挾車
聯絡人：峰哥 60176557 做圍網
仁 WY987
→ 1 個 item：
  {seq:1, order_type:"transport", customer:"金門", contract_no:"3802", work_description:"租挾車", driver_nickname:"仁", vehicle_no:"WY987", contact_person:"峰哥 60176557 做圍網"}
  注意：峰哥是聯絡人不是司機！

原文：
惠興-丹桂一期租車
跟人規矩
吾明問/聯絡：細昌 9095 5458
棋 YE6679
老泰 WC987
文 WY440
→ 3 個 items：
  {seq:1, order_type:"transport", customer:"惠興", work_description:"丹桂一期租車", driver_nickname:"棋", vehicle_no:"YE6679", contact_person:"細昌 9095 5458", remarks:"跟人規矩"}
  {seq:2, order_type:"transport", customer:"惠興", work_description:"丹桂一期租車", driver_nickname:"老泰", vehicle_no:"WC987", contact_person:"細昌 9095 5458", remarks:"跟人規矩"}
  {seq:3, order_type:"transport", customer:"惠興", work_description:"丹桂一期租車", driver_nickname:"文", vehicle_no:"WY440", contact_person:"細昌 9095 5458", remarks:"跟人規矩"}

原文：
惠興-西九至TKO137
台號： 143800
聯絡人： 9160 金毛強
電話： 9452 9852
偉 WP7366
→ 1 個 item：
  {seq:1, order_type:"transport", customer:"惠興", work_description:"西九至TKO137", driver_nickname:"偉", vehicle_no:"WP7366", contact_person:"金毛強 9160 / 9452 9852", remarks:"台號: 143800"}

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
- ⛔ 夜間 order 格式：D-M-YYYY(夜) 或 D-M-YYYY（夜）→ shift: "night"（日期後面帶「(夜)」或「（夜）」表示夜間班次）
- 如果日期後面沒有「(夜)」或「（夜）」，則 shift: "day"（日間班次，預設值）
- 夜間 order 的內容格式與日間相同，只是日期標記不同
- 全形數字（４）= 半形數字（4）
- 「暫定」→ order_status: "tentative"；「更新」→ is_update: true, order_status: "confirmed"
- 「明天」「聽日」「今日」等相對日期基於今天 ${today}

## 回覆格式（JSON，不加 markdown 代碼塊）

如果是 order：
{
  "message_type": "order",
  "confidence": 0.0-1.0,
  "order_date": "YYYY-MM-DD",
  "shift": "day" 或 "night",  // ⛔ 必填！日期帶(夜)/(夜）→ "night"，否則 "day"
  "is_update": true/false,
  "order_status": "tentative" 或 "confirmed",
  "items": [
    {
      "seq": 1,
      "order_type": "transport" 或 "manpower" 或 "machinery" 或 "notice" 或 "leave",  // ⛔ 必填！絕對不能省略！
      "contract_no": "合約號或null",
      "customer": "客戶名或null",
      "work_description": "工作描述或null",
      "location": "地點/路線或null",
      "driver_nickname": "司機/操作員花名或null（transport 和 machinery 用）",
      "vehicle_no": "車牌或null（transport 用，格式如 EM987）",
      "machine_code": "DC機械編號或null（machinery 用，統一格式如 DC14）",
      "team_leader": "帶隊人花名或null（manpower 用，括號內的人）",
      "staff_list": ["員工1", "員工2"] 或 null（manpower 用，頓號分隔的完整員工列表）,
      "contact_person": "聯絡人+電話或null（不是司機！）",
      "slip_write_as": "飛仔寫什麼或null",
      "is_suspended": true/false,
      "product_name": "商品名稱或null（如泥頭、石粉、混凝土、廢料等）",
      "product_unit": "商品單位或null（如車、噸、桶、包等）",
      "goods_quantity": "商品數量或null（數字）",
      "remarks": "備註或null"
    }
  ],
  "leave_list": ["請假/休息人員1", "請假/休息人員2"],
  "raw_summary": "簡短摘要"
}

如果是 modification：
{
  "message_type": "modification",
  "confidence": 0.0-1.0,
  "shift": "day" 或 "night",  // 如果訊息提到夜間→ "night"，否則 "day"
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
  "shift": "day",
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
  async getDailySummary(dateStr: string, shift: string = 'day'): Promise<DailySummary | null> {
    const dateStart = new Date(dateStr);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStr);
    dateEnd.setHours(23, 59, 59, 999);

    // 取得該天 + 該班次的所有 order（按版本排序）
    const orders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
        wa_order_shift: shift,
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

    // ── 核心修正：按 order_type 分組，每種類型取最新版本的 items ──
    // 同一天可能有多種 order（machinery v26, manpower v27, transport v28）
    // 不能只取最後一個 order，要合併所有類型

    // 1. 判斷每個 order 的主要 order_type（根據其 items 的多數類型）
    const getOrderPrimaryType = (order: typeof orders[0]): string => {
      const typeCounts: Record<string, number> = {};
      for (const item of order.items) {
        const t = item.wa_item_order_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      // 返回出現最多次的類型
      let maxType = 'unknown';
      let maxCount = 0;
      for (const [t, c] of Object.entries(typeCounts)) {
        if (c > maxCount) { maxType = t; maxCount = c; }
      }
      return maxType;
    };

    // 2. 按 order_type 分組，每組取最新版本（版本號最大的）
    const ordersByType: Record<string, typeof orders> = {};
    for (const order of orders) {
      const primaryType = getOrderPrimaryType(order);
      if (!ordersByType[primaryType]) ordersByType[primaryType] = [];
      ordersByType[primaryType].push(order);
    }

    // 3. 每組取最新版本的 items，合併成一個 summaryItems 列表
    const summaryItems: DailySummaryItem[] = [];
    const latestOrderPerType: typeof orders = [];

    const allDriverIds = new Set<number>();
    for (const order of orders) {
      for (const item of order.items) {
        if (item.wa_item_driver_id) {
          allDriverIds.add(item.wa_item_driver_id);
        }
      }
    }
    
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: Array.from(allDriverIds) } },
      select: { id: true, name_zh: true }
    });
    const employeeMap = new Map(employees.map(e => [e.id, e.name_zh]));

    for (const [_type, typeOrders] of Object.entries(ordersByType)) {
      // 按版本排序，取最新的
      typeOrders.sort((a, b) => a.wa_order_version - b.wa_order_version);
      const latestOrder = typeOrders[typeOrders.length - 1];
      latestOrderPerType.push(latestOrder);

      for (const item of latestOrder.items) {
        summaryItems.push({
          id: item.id,
          seq: item.wa_item_seq,
          order_type: item.wa_item_order_type,
          contract_no: item.wa_item_contract_no,
          customer: item.wa_item_customer,
          work_description: item.wa_item_work_desc,
          location: item.wa_item_location,
          driver_nickname: item.wa_item_driver_nickname,
          driver_id: item.wa_item_driver_id,
          driver_name_zh: item.wa_item_driver_id ? employeeMap.get(item.wa_item_driver_id) || null : null,
          vehicle_no: item.wa_item_vehicle_no,
          machine_code: item.wa_item_machine_code,
          contact_person: item.wa_item_contact_person,
          slip_write_as: item.wa_item_slip_write_as,
          is_suspended: item.wa_item_is_suspended,
          product_name: item.wa_item_product_name,
          product_unit: item.wa_item_product_unit,
          goods_quantity: item.wa_item_goods_quantity !== null ? Number(item.wa_item_goods_quantity) : null,
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
        });
      }
    }

    // 用最新的 order（按版本號）來決定整體狀態
    const overallLatestOrder = orders[orders.length - 1];

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
      shift,
      latest_status: overallLatestOrder.wa_order_status,
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
      select: { wa_order_date: true, wa_order_shift: true },
      orderBy: { wa_order_date: 'desc' },
    });

    // 取得不重複的日期+班次組合
    const uniqueDateShifts = [...new Set(
      allOrders.map((o) => `${o.wa_order_date.toISOString().slice(0, 10)}|${o.wa_order_shift}`),
    )].sort((a, b) => b.localeCompare(a)); // 最新日期在前

    // 產生每天每班次的總結
    const summaries: DailySummary[] = [];
    for (const dateShift of uniqueDateShifts) {
      const [dateStr, shift] = dateShift.split('|');
      const summary = await this.getDailySummary(dateStr, shift);
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
  private async syncDailySummaryToVerificationRecords(dateStr: string, shift: string = 'day') {
    const source = await this.prisma.verificationSource.findUnique({
      where: { source_code: 'whatsapp_order' },
    });
    if (!source) {
      this.logger.warn('whatsapp_order source not found, skipping sync');
      return;
    }

    const summary = await this.getDailySummary(dateStr, shift);
    if (!summary) return;

    const shiftSuffix = shift === 'night' ? '-night' : '';

    // 刪除該日期+班次的舊 verification_records（whatsapp_order 來源）
    const existingBatches = await this.prisma.verificationBatch.findMany({
      where: {
        batch_source_id: source.id,
        batch_code: { startsWith: `BATCH-${dateStr}-whatsapp_order-summary${shiftSuffix}` },
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
    const batchCode = `BATCH-${dateStr}-whatsapp_order-summary${shiftSuffix}`;
    const shiftLabel = shift === 'night' ? ' (夜間)' : '';

    const batch = await this.prisma.verificationBatch.create({
      data: {
        batch_code: batchCode,
        batch_source_id: source.id,
        batch_file_name: `WhatsApp Daily Summary ${dateStr}${shiftLabel}`,
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
        record_vehicle_no: item.vehicle_no || item.machine_code || null,
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
  // 修正：按 date + order_type 分組，合併所有版本的 items，
  //       同一車牌/機械編號取最新版本，排除 cancelled
  // ══════════════════════════════════════════════════════════════
  async getDailySummaryItemsForMatching(dateFrom: Date, dateTo: Date) {
    const dateStart = new Date(dateFrom);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateTo);
    dateEnd.setHours(23, 59, 59, 999);

    // 取得日期範圍內所有 order，按日期和版本排序（版本小→大）
    const orders = await this.prisma.verificationWaOrder.findMany({
      where: {
        wa_order_date: { gte: dateStart, lte: dateEnd },
      },
      include: {
        items: true,
      },
      orderBy: [{ wa_order_date: 'asc' }, { wa_order_version: 'asc' }],
    });

    // 判斷每個 order 的主要 order_type（根據其 items 的多數類型）
    const getOrderPrimaryType = (order: typeof orders[0]): string => {
      const typeCounts: Record<string, number> = {};
      for (const item of order.items) {
        const t = item.wa_item_order_type || 'unknown';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      }
      let maxType = 'unknown';
      let maxCount = 0;
      for (const [t, c] of Object.entries(typeCounts)) {
        if (c > maxCount) { maxType = t; maxCount = c; }
      }
      return maxType;
    };

    // 按 date + shift + order_type 分組，收集所有版本的 orders
    // key: "YYYY-MM-DD|shift|order_type"
    const ordersByDateType = new Map<string, (typeof orders[0])[]>();
    for (const order of orders) {
      const dateKey = order.wa_order_date.toISOString().slice(0, 10);
      const primaryType = getOrderPrimaryType(order);
      const groupKey = `${dateKey}|${order.wa_order_shift}|${primaryType}`;
      if (!ordersByDateType.has(groupKey)) {
        ordersByDateType.set(groupKey, []);
      }
      ordersByDateType.get(groupKey)!.push(order);
    }

    // 合併每組所有版本的 items，同一車牌/機械編號取最新版本
    const allItems: any[] = [];
    for (const [, groupOrders] of ordersByDateType) {
      // 用車牌/機械編號作為 dedup key，新版本覆蓋舊版本
      const itemMap = new Map<string, { item: any; order: typeof orders[0] }>();
      for (const order of groupOrders) {
        for (const item of order.items) {
          const vehicleId = (
            item.wa_item_vehicle_no ||
            item.wa_item_machine_code ||
            ''
          ).trim().toUpperCase();
          if (vehicleId) {
            // 有車牌/機械編號：新版本覆蓋舊版本
            const existing = itemMap.get(vehicleId);
            if (!existing || order.wa_order_version > existing.order.wa_order_version) {
              itemMap.set(vehicleId, { item, order });
            } else if (order.wa_order_version === existing.order.wa_order_version) {
              // 同版本不同 item，用唯一 key 保留
              const uniqueKey = `${vehicleId}__id_${item.id}`;
              if (!itemMap.has(uniqueKey)) {
                itemMap.set(uniqueKey, { item, order });
              }
            }
          } else {
            // 無車牌/機械編號（如 manpower）：用 item id 作為唯一 key，不去重
            const uniqueKey = `__noid_${item.id}`;
            itemMap.set(uniqueKey, { item, order });
          }
        }
      }
      // 排除 cancelled 並展平
      for (const [, { item, order }] of itemMap) {
        if (item.wa_item_mod_status === 'cancelled') continue;
        allItems.push({
          ...item,
          order_date: order.wa_order_date.toISOString().slice(0, 10),
          order_status: order.wa_order_status,
          order_version: order.wa_order_version,
        });
      }
    }

    return allItems;
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

  // ══════════════════════════════════════════════════════════════
  // Dashboard 打卡訊息 Feed
  // ══════════════════════════════════════════════════════════════
  /**
   * 返回最近 N 條白名單群組訊息（包含 clockin + order 群組）供 Dashboard feed 顯示
   */
  async getClockinFeed(limit = 50) {
    const CLOCKIN_GROUPS = [
      '120363278016234111@g.us',
      '120363277125015302@g.us',
      '120363262093688968@g.us',
      '85262366968-1600675068@g.us',
    ];
    const GROUP_NAME_MAP: Record<string, string> = {
      '120363278016234111@g.us': '工程部',
      '120363277125015302@g.us': '運輸部',
      '120363262093688968@g.us': '機械部',
      '85262366968-1600675068@g.us': '備忘錄',
    };
    const messages = await this.prisma.verificationWaMessage.findMany({
      where: {
        wa_msg_group_id: { in: CLOCKIN_GROUPS },
      },
      select: {
        id: true,
        wa_msg_group_id: true,
        wa_msg_group_name: true,
        wa_msg_sender_name: true,
        wa_msg_timestamp: true,
        wa_msg_body: true,
        wa_msg_ai_classified: true,
        wa_msg_created_at: true,
      },
      orderBy: { wa_msg_created_at: 'desc' },
      take: limit,
    });
    return messages.map(m => ({
      id: m.id,
      group_id: m.wa_msg_group_id,
      group_name: GROUP_NAME_MAP[m.wa_msg_group_id || ''] || m.wa_msg_group_name || '未知群組',
      sender: m.wa_msg_sender_name,
      timestamp: m.wa_msg_timestamp || m.wa_msg_created_at,
      body: m.wa_msg_body,
      classification: m.wa_msg_ai_classified,
    }));
  }

  // ══════════════════════════════════════════════════════════════
  // CRUD: 手動編輯 Order Items
  // ══════════════════════════════════════════════════════════════

  /** 更新單筆 order item */
  async updateOrderItem(
    orderId: number,
    itemId: number,
    data: {
      order_type?: string;
      contract_no?: string;
      customer?: string;
      work_description?: string;
      location?: string;
      driver_nickname?: string;
      vehicle_no?: string;
      machine_code?: string;
      contact_person?: string;
      slip_write_as?: string;
      is_suspended?: boolean;
      product_name?: string;
      product_unit?: string;
      goods_quantity?: number;
      remarks?: string;
    },
  ) {
    // 確認 item 存在且屬於指定 order
    const item = await this.prisma.verificationWaOrderItem.findFirst({
      where: { id: itemId, wa_item_order_id: orderId },
    });
    if (!item) {
      return { success: false, reason: 'item_not_found' };
    }

    // 記錄修改前的值（AI feedback 用）
    const prevSnapshot: Record<string, any> = {};
    const newSnapshot: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      order_type: 'wa_item_order_type',
      contract_no: 'wa_item_contract_no',
      customer: 'wa_item_customer',
      work_description: 'wa_item_work_desc',
      location: 'wa_item_location',
      driver_nickname: 'wa_item_driver_nickname',
      vehicle_no: 'wa_item_vehicle_no',
      machine_code: 'wa_item_machine_code',
      contact_person: 'wa_item_contact_person',
      slip_write_as: 'wa_item_slip_write_as',
      is_suspended: 'wa_item_is_suspended',
      product_name: 'wa_item_product_name',
      product_unit: 'wa_item_product_unit',
      goods_quantity: 'wa_item_goods_quantity',
      remarks: 'wa_item_remarks',
    };

    const updateData: Record<string, any> = {};
    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        const oldVal = (item as any)[dbCol];
        const newVal = data[key as keyof typeof data];
        if (oldVal !== newVal) {
          prevSnapshot[key] = oldVal;
          newSnapshot[key] = newVal;
          updateData[dbCol] = newVal === '' ? null : newVal;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: true, reason: 'no_changes', item_id: itemId };
    }

    // 更新 item
    await this.prisma.verificationWaOrderItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // 記錄 AI feedback（修改歷史）
    await this.prisma.verificationWaModLog.create({
      data: {
        mod_order_id: orderId,
        mod_item_id: itemId,
        mod_msg_id: item.wa_item_order_id, // 用 order_id 作為 msg_id 的替代
        mod_type: 'manual_edit',
        mod_description: `手動修改: ${Object.keys(prevSnapshot).join(', ')}`,
        mod_prev_value: prevSnapshot,
        mod_new_value: newSnapshot,
        mod_ai_confidence: null,
      },
    });

    return {
      success: true,
      item_id: itemId,
      changes: newSnapshot,
      prev_values: prevSnapshot,
    };
  }

  /** 新增 order item */
  async addOrderItem(
    orderId: number,
    data: {
      order_type?: string;
      contract_no?: string;
      customer?: string;
      work_description?: string;
      location?: string;
      driver_nickname?: string;
      vehicle_no?: string;
      machine_code?: string;
      contact_person?: string;
      slip_write_as?: string;
      is_suspended?: boolean;
      product_name?: string;
      product_unit?: string;
      goods_quantity?: number;
      remarks?: string;
    },
  ) {
    const order = await this.prisma.verificationWaOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      return { success: false, reason: 'order_not_found' };
    }

    // 取得目前最大 seq
    const maxSeqItem = await this.prisma.verificationWaOrderItem.findFirst({
      where: { wa_item_order_id: orderId },
      orderBy: { wa_item_seq: 'desc' },
    });
    const nextSeq = (maxSeqItem?.wa_item_seq || 0) + 1;

    const newItem = await this.prisma.verificationWaOrderItem.create({
      data: {
        wa_item_order_id: orderId,
        wa_item_seq: nextSeq,
        wa_item_order_type: data.order_type || null,
        wa_item_contract_no: data.contract_no || null,
        wa_item_customer: data.customer || null,
        wa_item_work_desc: data.work_description || null,
        wa_item_location: data.location || null,
        wa_item_driver_nickname: data.driver_nickname || null,
        wa_item_driver_id: null,
        wa_item_vehicle_no: data.vehicle_no || null,
        wa_item_machine_code: data.machine_code || null,
        wa_item_contact_person: data.contact_person || null,
        wa_item_slip_write_as: data.slip_write_as || null,
        wa_item_is_suspended: data.is_suspended || false,
        wa_item_product_name: data.product_name || null,
        wa_item_product_unit: data.product_unit || null,
        wa_item_goods_quantity: data.goods_quantity || null,
        wa_item_remarks: data.remarks || null,
        wa_item_mod_status: 'added',
        wa_item_mod_prev_data: undefined,
      },
    });

    // 記錄 AI feedback
    await this.prisma.verificationWaModLog.create({
      data: {
        mod_order_id: orderId,
        mod_item_id: newItem.id,
        mod_msg_id: orderId, // 手動新增沒有 msg_id，用 order_id 替代
        mod_type: 'manual_add',
        mod_description: `手動新增 item #${nextSeq}`,
        mod_prev_value: Prisma.DbNull,
        mod_new_value: data as any,
        mod_ai_confidence: null,
      },
    });

    // 更新 order item_count
    const totalItems = await this.prisma.verificationWaOrderItem.count({
      where: { wa_item_order_id: orderId },
    });
    await this.prisma.verificationWaOrder.update({
      where: { id: orderId },
      data: { wa_order_item_count: totalItems },
    });

    return {
      success: true,
      item_id: newItem.id,
      seq: nextSeq,
      order_id: orderId,
    };
  }

  /** 刪除 order item */
  async deleteOrderItem(orderId: number, itemId: number) {
    const item = await this.prisma.verificationWaOrderItem.findFirst({
      where: { id: itemId, wa_item_order_id: orderId },
    });
    if (!item) {
      return { success: false, reason: 'item_not_found' };
    }

    // 記錄刪除前的快照（AI feedback 用）
    const prevSnapshot = {
      order_type: item.wa_item_order_type,
      contract_no: item.wa_item_contract_no,
      customer: item.wa_item_customer,
      work_description: item.wa_item_work_desc,
      location: item.wa_item_location,
      driver_nickname: item.wa_item_driver_nickname,
      vehicle_no: item.wa_item_vehicle_no,
      machine_code: item.wa_item_machine_code,
      contact_person: item.wa_item_contact_person,
      is_suspended: item.wa_item_is_suspended,
      remarks: item.wa_item_remarks,
    };

    // 先刪除關聯的 mod_logs
    await this.prisma.verificationWaModLog.deleteMany({
      where: { mod_item_id: itemId },
    });

    // 刪除 item
    await this.prisma.verificationWaOrderItem.delete({
      where: { id: itemId },
    });

    // 記錄刪除歷史到 order 級別的 mod_log
    await this.prisma.verificationWaModLog.create({
      data: {
        mod_order_id: orderId,
        mod_item_id: null,
        mod_msg_id: orderId,
        mod_type: 'manual_delete',
        mod_description: `手動刪除 item #${item.wa_item_seq}`,
        mod_prev_value: prevSnapshot,
        mod_new_value: Prisma.DbNull,
        mod_ai_confidence: null,
      },
    });

    // 更新 order item_count
    const totalItems = await this.prisma.verificationWaOrderItem.count({
      where: { wa_item_order_id: orderId },
    });
    await this.prisma.verificationWaOrder.update({
      where: { id: orderId },
      data: { wa_order_item_count: totalItems },
    });

    return {
      success: true,
      deleted_item_id: itemId,
      order_id: orderId,
      prev_values: prevSnapshot,
    };
  }
}
