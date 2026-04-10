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
}

export interface ParsedClockIn {
  is_clock_in: boolean;
  date: string;
  name: string;
  equipment_no: string;
  company: string;
  contract_no: string;
  start_location: string;
  end_location: string;
  work_content: string;
  work_time: string;
  mid_shift: number;
  ot: number;
  receipt_nos: string[];
  goods_quantity: number;
  service_type: string;
}

// ══════════════════════════════════════════════════════════════
// 白名單群組
// ══════════════════════════════════════════════════════════════

const WHITELIST_GROUPS = [
  '120363278016234111@g.us',
  '120363277125015302@g.us',
  '120363262093688968@g.us',
  '85262366968-1600675068@g.us',
];

@Injectable()
export class WhatsappClockinService {
  private readonly logger = new Logger(WhatsappClockinService.name);
  private openai: OpenAI;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set! WhatsApp clock-in parsing will fail.');
    }
    this.openai = createOpenAIClient();
  }

  // ────────────────────────────────────────────────────────────
  // 主入口
  // ────────────────────────────────────────────────────────────

  async processClockIn(payload: ClockInPayload): Promise<{
    success: boolean;
    workLogId?: number;
    parsed?: ParsedClockIn;
    error?: string;
  }> {
    const { chatId, sender, text, groupName } = payload;

    // 1. 白名單檢查
    if (!WHITELIST_GROUPS.includes(chatId)) {
      this.logger.warn(`Rejected message from non-whitelisted group: ${chatId}`);
      return { success: false, error: 'Group not whitelisted' };
    }

    // 2. 儲存原始訊息到 verification_wa_messages（供 Dashboard feed 顯示）
    try {
      await this.prisma.verificationWaMessage.create({
        data: {
          wa_msg_group_id: chatId,
          wa_msg_group_name: groupName || null,
          wa_msg_sender_name: sender.split('@')[0],
          wa_msg_timestamp: new Date(),
          wa_msg_body: text,
          wa_msg_type: 'text',
          wa_msg_is_forwarded: false,
          wa_msg_has_media: false,
          wa_msg_ai_classified: 'clockin',
          wa_msg_processed: false,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to save raw message to wa_messages: ${err.message}`);
    }

    // 3. 過濾非文字訊息
    if (!text || text.trim() === '' || text.startsWith('[非文字訊息')) {
      this.logger.log('Skipping non-text message');
      return { success: false, error: 'Non-text message, skipped' };
    }

    try {
      // 3. 載入 ERP 資料做 fuzzy matching 參考
      const [employees, machinery, vehicles, partners, contracts, locationOptions] = await Promise.all([
        this.prisma.employee.findMany({
          where: { status: 'active' },
          select: { id: true, nickname: true, name_zh: true, name_en: true },
        }),
        this.prisma.machinery.findMany({
          select: { id: true, machine_code: true, brand: true, model: true, machine_type: true },
        }),
        this.prisma.vehicle.findMany({
          select: { id: true, plate_number: true, machine_type: true },
        }),
        this.prisma.partner.findMany({
          where: { partner_type: 'client' },
          select: { id: true, name: true, name_en: true },
        }),
        this.prisma.contract.findMany({
          select: { id: true, contract_no: true, contract_name: true },
        }),
        this.prisma.fieldOption.findMany({
          where: { category: 'location', is_active: true },
          select: { id: true, label: true, aliases: true },
        }),
      ]);

      // 4. 建立參考資料字串
      const employeeRef = employees.map(e =>
        `ID:${e.id} 花名:${e.nickname || ''} 中文:${e.name_zh || ''}`
      ).join('\n');

      const machineryRef = machinery.map(m =>
        `ID:${m.id} 編號:${m.machine_code || ''} 品牌:${m.brand || ''} 型號:${m.model || ''} 類型:${m.machine_type || ''}`
      ).join('\n');

      const vehicleRef = vehicles.map(v =>
        `ID:${v.id} 車牌:${v.plate_number || ''} 類型:${v.machine_type || ''}`
      ).join('\n');

      const partnerRef = partners.map(p =>
        `ID:${p.id} 名稱:${p.name || ''} 英文:${p.name_en || ''}`
      ).join('\n');

      const contractRef = contracts.map(c =>
        `ID:${c.id} 合約號:${c.contract_no || ''} 名稱:${c.contract_name || ''}`
      ).join('\n');

      const locationRef = locationOptions.map(l => {
        const aliases = (l.aliases as string[] | null) || [];
        return aliases.length > 0 ? `${l.label}（別名：${aliases.join('/')}）` : l.label;
      }).join(', ');

      // 5. 用 OpenAI 解析訊息
      const parsed = await this.parseWithOpenAI(text, {
        employeeRef,
        machineryRef,
        vehicleRef,
        partnerRef,
        contractRef,
        locationRef,
      });

      if (!parsed) {
        return { success: false, error: 'Failed to parse message with AI' };
      }

      // 6. 檢查是否為非打卡訊息（請假、閒聊等）
      if (!parsed.is_clock_in) {
        this.logger.log('AI determined this is not a clock-in message');
        return { success: false, error: 'Not a clock-in message' };
      }

      // 7. Fuzzy match 員工
      const matchedEmployee = this.fuzzyMatchEmployee(parsed.name, employees);

      // 8. Fuzzy match 機械/車輛
      const equipmentMatch = this.fuzzyMatchEquipment(parsed.equipment_no, machinery, vehicles);

      // 9. Fuzzy match 客戶
      const matchedClient = this.fuzzyMatchPartner(parsed.company, partners);

      // 10. Fuzzy match 合約
      const matchedContract = this.fuzzyMatchContract(parsed.contract_no, contracts);

      // 11. 解析日期
      const scheduledDate = this.parseDate(parsed.date);

      // 12. 解析工作時間
      const { startTime, endTime } = this.parseWorkTime(parsed.work_time);

      // 13. 地點處理：檢查 FieldOption 是否存在，不存在則自動建立
      let isLocationNew = false;
      const startLoc = (parsed.start_location || '').trim();
      const endLoc = (parsed.end_location || '').trim();

      if (startLoc) {
        const created = await this.ensureLocationOption(startLoc, locationOptions);
        if (created) isLocationNew = true;
      }
      if (endLoc && endLoc !== startLoc) {
        const created = await this.ensureLocationOption(endLoc, locationOptions);
        if (created) isLocationNew = true;
      }

      // 14. 多飛仔號碼處理（逗號分隔）
      const receiptNo = (parsed.receipt_nos || []).filter(Boolean).join(', ') || null;
      const goodsQty = parsed.goods_quantity > 0 ? parsed.goods_quantity : null;

      // 15. 建立 WorkLog
      const phone = sender.split('@')[0];
      const workLog = await this.prisma.workLog.create({
        data: {
          status: 'editing',
          source: 'whatsapp',
          scheduled_date: scheduledDate,
          employee_id: matchedEmployee?.id || null,
          equipment_number: parsed.equipment_no || null,
          machine_type: equipmentMatch?.type || null,
          equipment_source: equipmentMatch?.source || null,
          client_id: matchedClient?.id || null,
          contract_id: matchedContract?.id || null,
          client_contract_no: parsed.contract_no || null,
          start_location: startLoc || null,
          end_location: endLoc || null,
          start_time: startTime || null,
          end_time: endTime || null,
          is_mid_shift: (parsed.mid_shift || 0) > 0,
          quantity: parsed.mid_shift > 0 ? parsed.mid_shift : null,
          ot_quantity: parsed.ot > 0 ? parsed.ot : null,
          receipt_no: receiptNo,
          goods_quantity: goodsQty,
          unverified_client_name: parsed.company || null,
          service_type: parsed.service_type || parsed.work_content || null,
          is_location_new: isLocationNew,
          ai_parsed_data: parsed as any,
          remarks: [
            `[WhatsApp 打卡]`,
            `群組: ${groupName || chatId}`,
            `電話: ${phone}`,
            `原始訊息: ${text}`,
            parsed.work_content ? `工作內容: ${parsed.work_content}` : '',
          ].filter(Boolean).join('\n'),
        },
      });

      this.logger.log(`Created WorkLog #${workLog.id} from WhatsApp clock-in by ${parsed.name} (location_new=${isLocationNew})`);

      return { success: true, workLogId: workLog.id, parsed };
    } catch (error) {
      this.logger.error(`Error processing clock-in: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  // ────────────────────────────────────────────────────────────
  // 地點 FieldOption 自動建立
  // ────────────────────────────────────────────────────────────

  /**
   * 檢查地點是否已存在於 FieldOption location 類別中。
   * 若不存在，自動建立新選項。
   * @returns true 表示新建立了選項，false 表示已存在
   */
  private async ensureLocationOption(
    location: string,
    existingOptions: { id: number; label: string; aliases?: any }[],
  ): Promise<boolean> {
    if (!location) return false;

    const normalized = location.trim();
    const normalizedLower = normalized.toLowerCase();

    // 先在已載入的選項中查找主名稱（不區分大小寫）
    const foundByLabel = existingOptions.some(
      opt => opt.label.trim().toLowerCase() === normalizedLower,
    );
    if (foundByLabel) return false;

    // 再查找 aliases（別名匹配）
    const foundByAlias = existingOptions.some(opt => {
      const aliases = (opt.aliases as string[] | null) || [];
      return aliases.some(a => a.trim().toLowerCase() === normalizedLower);
    });
    if (foundByAlias) {
      this.logger.log(`Location "${normalized}" matched via alias — skipping auto-create`);
      return false;
    }

    // 再次從 DB 確認（避免並發問題）
    const dbCheck = await this.prisma.fieldOption.findFirst({
      where: {
        category: 'location',
        label: { equals: normalized, mode: 'insensitive' },
      },
    });
    if (dbCheck) return false;

    // 也檢查 DB 中的 aliases
    const dbAliasCheck = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT id FROM field_options
      WHERE category = 'location'
        AND is_active = true
        AND aliases::text ILIKE '%' || ${normalized} || '%'
      LIMIT 1
    `;
    if (dbAliasCheck && dbAliasCheck.length > 0) {
      this.logger.log(`Location "${normalized}" matched via DB alias — skipping auto-create`);
      return false;
    }

    // 不存在，建立新選項
    const maxSort = await this.prisma.fieldOption.aggregate({
      where: { category: 'location' },
      _max: { sort_order: true },
    });

    await this.prisma.fieldOption.create({
      data: {
        category: 'location',
        label: normalized,
        sort_order: (maxSort._max.sort_order || 0) + 1,
        is_active: true,
      },
    });

    this.logger.log(`Auto-created new location field option: "${normalized}"`);
    return true;
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
  // OpenAI 解析（優化 Prompt：運輸部、工程部、機械部格式）
  // ────────────────────────────────────────────────────────────

  private async parseWithOpenAI(
    text: string,
    refs: {
      employeeRef: string;
      machineryRef: string;
      vehicleRef: string;
      partnerRef: string;
      contractRef: string;
      locationRef: string;
    },
  ): Promise<ParsedClockIn | null> {
    const now = new Date();
    const hkNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = `${hkNow.getDate()}/${hkNow.getMonth() + 1}/${hkNow.getFullYear()}`;

    const systemPrompt = `你是香港建築運輸公司「明達建築」的 WhatsApp 打卡訊息解析助手。
公司有三個部門，各有不同的打卡格式：

【運輸部格式】結構化標籤，通常包含：
  日期: dd/mm
  車牌: XX1234
  公司: 客戶名稱
  地點: 起點→終點（或單一地點）
  車數: 數字（飛仔數量）
  飛仔號碼: 可能有多個號碼
  中直: 小時數
  OT: 小時數

【工程部格式】簡短格式或標準格式：
  簡短: 花名 / 日期 / 公司 / 地點+機械+工作 / 時間
  標準: 合約號碼、工作性質、工作時間、機械編號
  例如: "洪 / 10/4 / 有利 / 將軍澳 ZX350 平整 / 08:00-18:00"

【機械部格式】包含機械編號和工作：
  機械編號: DC系列、WY系列等
  工作范围: 地點和工作內容
  中直/OT: 小時數

請從訊息中提取以下 JSON 欄位：
{
  "is_clock_in": true/false,  // 是否為打卡訊息（請假、閒聊、問候、通知等非打卡內容設為 false）
  "date": "dd/mm/yyyy",       // 日期，無明確日期則用今天 ${todayStr}
  "name": "",                  // 員工姓名/花名
  "equipment_no": "",          // 機械編號或車牌（如 VL647, DC17, ZX350）
  "company": "",               // 客戶公司名稱
  "contract_no": "",           // 合約號碼
  "start_location": "",        // 起點/工作地點
  "end_location": "",          // 終點（運輸部常有起點→終點，其他部門可能只有一個地點，此時 start 和 end 相同）
  "work_content": "",          // 工作內容描述
  "work_time": "",             // 工作時間（如 08:00-18:00）
  "mid_shift": 0,              // 中直小時數（純數字）
  "ot": 0,                     // OT 加班小時數（純數字）
  "receipt_nos": [],            // 飛仔號碼陣列（可能有多個）
  "goods_quantity": 0,          // 車數/商品數量（純數字）
  "service_type": ""            // 服務類型：運輸/代工/工程/機械/管工工作/維修保養/雜務 等
}

ERP 員工列表（用於姓名匹配，優先匹配花名）：
${refs.employeeRef}

ERP 機械列表：
${refs.machineryRef}

ERP 車輛列表：
${refs.vehicleRef}

ERP 客戶列表：
${refs.partnerRef}

ERP 合約列表：
${refs.contractRef}

ERP 已有地點列表（盡量匹配已有地點，如果訊息中的地點名稱與列表中某個地點相似，使用列表中的名稱）：
${refs.locationRef}

重要規則：
1. 即使缺少標籤，也請根據上下文推斷欄位
2. 非打卡訊息（請假、休息、閒聊、問候、通知、圖片描述、語音描述）：is_clock_in 設為 false
3. 中直和 OT 只輸出數字，沒有就輸出 0
4. 盡量將訊息中的名字匹配到員工列表中的花名
5. 盡量將機械編號匹配到機械列表或車輛列表
6. 地點盡量匹配已有地點列表，如果是新地點就保留原文
7. 運輸部訊息通常有起點和終點，用「→」「去」「到」「至」等分隔
8. 如果只有一個地點，start_location 和 end_location 填相同值
9. 飛仔號碼可能出現多個，全部放入 receipt_nos 陣列
10. service_type 根據內容推斷：有車牌/車數→運輸，有機械編號→機械，有工程描述→工程
11. 時間分隔符多樣：「-」「～」「－」「.」「至」「到」都要能識別

請僅輸出乾淨 JSON，不要加 \`\`\`json 標記。`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const cleaned = content.replace(/```json|```/g, '').trim();
      const raw = JSON.parse(cleaned);

      return {
        is_clock_in: raw.is_clock_in !== false,
        date: raw.date || todayStr,
        name: raw.name || '',
        equipment_no: raw.equipment_no || '',
        company: raw.company || '',
        contract_no: raw.contract_no || '',
        start_location: raw.start_location || raw.location || '',
        end_location: raw.end_location || raw.location || '',
        work_content: raw.work_content || '',
        work_time: raw.work_time || '',
        mid_shift: Number(raw.mid_shift) || 0,
        ot: Number(raw.ot) || 0,
        receipt_nos: Array.isArray(raw.receipt_nos) ? raw.receipt_nos.map(String) : [],
        goods_quantity: Number(raw.goods_quantity) || 0,
        service_type: raw.service_type || '',
      };
    } catch (error) {
      this.logger.error(`OpenAI parsing error: ${error.message}`);
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // Fuzzy Matching 工具
  // ────────────────────────────────────────────────────────────

  private fuzzyMatchEmployee(
    name: string,
    employees: { id: number; nickname: string | null; name_zh: string | null; name_en: string | null }[],
  ): { id: number } | null {
    if (!name) return null;
    const n = name.trim().toLowerCase();

    // 精確匹配
    for (const e of employees) {
      if (
        (e.nickname && e.nickname.toLowerCase() === n) ||
        (e.name_zh && e.name_zh.toLowerCase() === n) ||
        (e.name_en && e.name_en.toLowerCase() === n)
      ) {
        return { id: e.id };
      }
    }

    // 包含匹配
    for (const e of employees) {
      if (
        (e.nickname && (e.nickname.toLowerCase().includes(n) || n.includes(e.nickname.toLowerCase()))) ||
        (e.name_zh && (e.name_zh.toLowerCase().includes(n) || n.includes(e.name_zh.toLowerCase()))) ||
        (e.name_en && (e.name_en.toLowerCase().includes(n) || n.includes(e.name_en.toLowerCase())))
      ) {
        return { id: e.id };
      }
    }

    return null;
  }

  private fuzzyMatchEquipment(
    equipmentNo: string,
    machinery: { id: number; machine_code: string | null; brand: string | null; model: string | null; machine_type: string | null }[],
    vehicles: { id: number; plate_number: string | null; machine_type: string | null }[],
  ): { type: string; source: 'machinery' | 'vehicle' } | null {
    if (!equipmentNo) return null;
    const eq = equipmentNo.trim().toUpperCase().replace(/\s+/g, '');

    // 匹配機械
    for (const m of machinery) {
      const code = (m.machine_code || '').toUpperCase().replace(/\s+/g, '');
      if (code && (code === eq || code.includes(eq) || eq.includes(code))) {
        return { type: m.machine_type || '機械', source: 'machinery' };
      }
    }

    // 匹配車輛
    for (const v of vehicles) {
      const plate = (v.plate_number || '').toUpperCase().replace(/\s+/g, '');
      if (plate && (plate === eq || plate.includes(eq) || eq.includes(plate))) {
        return { type: v.machine_type || '車輛', source: 'vehicle' };
      }
    }

    // 根據編號前綴推斷
    if (/^DC\d/i.test(eq)) return { type: '挖掘機', source: 'machinery' };
    if (/^VL\d/i.test(eq) || /^EM\d/i.test(eq)) return { type: '泥頭車', source: 'vehicle' };
    if (/^ZX\d/i.test(eq)) return { type: '挖掘機', source: 'machinery' };
    if (/^WY\d/i.test(eq)) return { type: '機械', source: 'machinery' };

    return null;
  }

  private fuzzyMatchPartner(
    company: string,
    partners: { id: number; name: string | null; name_en: string | null }[],
  ): { id: number } | null {
    if (!company) return null;
    const c = company.trim().toLowerCase();

    for (const p of partners) {
      if (
        (p.name && p.name.toLowerCase() === c) ||
        (p.name_en && p.name_en.toLowerCase() === c)
      ) {
        return { id: p.id };
      }
    }

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

  private fuzzyMatchContract(
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
  // 日期/時間解析工具
  // ────────────────────────────────────────────────────────────

  private parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;

    // 嘗試 dd/mm/yyyy
    const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (ddmmyyyy) {
      const [, d, m, y] = ddmmyyyy;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    // 嘗試 yyyy-mm-dd 或 yyyy/mm/dd
    const yyyymmdd = dateStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (yyyymmdd) {
      const [, y, m, d] = yyyymmdd;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    // 嘗試 dd/mm（無年份，用今年）
    const ddmm = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ddmm) {
      const [, d, m] = ddmm;
      return new Date(new Date().getFullYear(), Number(m) - 1, Number(d));
    }

    return null;
  }

  private parseWorkTime(timeStr: string): { startTime: string | null; endTime: string | null } {
    if (!timeStr) return { startTime: null, endTime: null };

    // 匹配 HH:MM-HH:MM 或 HH:MM~HH:MM 或 HH:MM～HH:MM 或 HH.MM-HH.MM
    const match = timeStr.match(/(\d{1,2}[:.]\d{2})\s*[-~～－至到]\s*(\d{1,2}[:.]\d{2})/);
    if (match) {
      return {
        startTime: match[1].replace('.', ':'),
        endTime: match[2].replace('.', ':'),
      };
    }

    // 只有一個時間
    const single = timeStr.match(/(\d{1,2}[:.]\d{2})/);
    if (single) {
      return { startTime: single[1].replace('.', ':'), endTime: null };
    }

    return { startTime: null, endTime: null };
  }
}
