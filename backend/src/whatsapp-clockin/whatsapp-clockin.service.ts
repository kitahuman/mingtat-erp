import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

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
  date: string;
  name: string;
  equipment_no: string;
  company: string;
  contract_no: string;
  location: string;
  work_content: string;
  work_time: string;
  mid_shift: number;
  ot: number;
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
    this.openai = new OpenAI({ apiKey });
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

    // 2. 過濾非文字訊息
    if (!text || text.trim() === '' || text.startsWith('[非文字訊息')) {
      this.logger.log('Skipping non-text message');
      return { success: false, error: 'Non-text message, skipped' };
    }

    try {
      // 3. 載入 ERP 資料做 fuzzy matching 參考
      const [employees, machinery, vehicles, partners, contracts] = await Promise.all([
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

      // 5. 用 OpenAI 解析訊息
      const parsed = await this.parseWithOpenAI(text, {
        employeeRef,
        machineryRef,
        vehicleRef,
        partnerRef,
        contractRef,
      });

      if (!parsed) {
        return { success: false, error: 'Failed to parse message with AI' };
      }

      // 6. 檢查是否為非打卡訊息
      if (
        parsed.name === '非打卡訊息' ||
        parsed.name === '非文字訊息，如圖片或語音' ||
        parsed.name === ''
      ) {
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

      // 13. 建立 WorkLog
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
          start_location: parsed.location || null,
          end_location: parsed.location || null,
          start_time: startTime || null,
          end_time: endTime || null,
          is_mid_shift: (parsed.mid_shift || 0) > 0,
          quantity: parsed.mid_shift > 0 ? parsed.mid_shift : null,
          ot_quantity: parsed.ot > 0 ? parsed.ot : null,
          unverified_client_name: parsed.company || null,
          remarks: [
            `[WhatsApp 打卡]`,
            `群組: ${groupName || chatId}`,
            `電話: ${phone}`,
            `原始訊息: ${text}`,
            parsed.work_content ? `工作內容: ${parsed.work_content}` : '',
          ].filter(Boolean).join('\n'),
          service_type: parsed.work_content || null,
        },
      });

      this.logger.log(`Created WorkLog #${workLog.id} from WhatsApp clock-in by ${parsed.name}`);

      return { success: true, workLogId: workLog.id, parsed };
    } catch (error) {
      this.logger.error(`Error processing clock-in: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  // ────────────────────────────────────────────────────────────
  // OpenAI 解析
  // ────────────────────────────────────────────────────────────

  private async parseWithOpenAI(
    text: string,
    refs: {
      employeeRef: string;
      machineryRef: string;
      vehicleRef: string;
      partnerRef: string;
      contractRef: string;
    },
  ): Promise<ParsedClockIn | null> {
    const now = new Date();
    const hkNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayStr = `${hkNow.getDate()}/${hkNow.getMonth() + 1}/${hkNow.getFullYear()}`;

    const systemPrompt = `你是一個專業的打卡訊息解析助手。請從 WhatsApp 訊息中提取打卡資訊。

提取欄位：
- date: 日期（格式 dd/mm/yyyy）。如果訊息中沒有明確日期，使用今天 ${todayStr}。注意修正常見 OCR 錯誤（0寫成O、1寫成l/I等）。日期應該接近當前日期。
- name: 員工姓名/花名（盡量匹配以下員工列表中的花名或中文名）
- equipment_no: 機械編號/車牌（例如 VL647, EM987, DC17, ZX350）
- company: 公司名稱/客戶名稱
- contract_no: 合約號碼
- location: 工作地點
- work_content: 工作內容
- work_time: 工作時間（例如 08:00-18:00）
- mid_shift: 中直小時數（純數字，沒有就是 0）
- ot: OT 加班小時數（純數字，沒有就是 0）

ERP 員工列表（用於姓名匹配）：
${refs.employeeRef}

ERP 機械列表（用於機械編號匹配）：
${refs.machineryRef}

ERP 車輛列表（用於車牌匹配）：
${refs.vehicleRef}

ERP 客戶列表（用於公司名稱匹配）：
${refs.partnerRef}

ERP 合約列表（用於合約號碼匹配）：
${refs.contractRef}

重要規則：
1. 即使缺少標籤，也請根據上下文推斷
2. 如果內容完全與打卡無關（如圖片、語音、閒聊），name 欄位填 "非打卡訊息"
3. 中直和 OT 只輸出數字，沒有就輸出 0
4. 盡量將訊息中的名字匹配到員工列表中的花名
5. 盡量將機械編號匹配到機械列表或車輛列表

請僅輸出乾淨 JSON，不要加 \`\`\`json 標記。`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const cleaned = content.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        date: parsed.date || todayStr,
        name: parsed.name || '',
        equipment_no: parsed.equipment_no || '',
        company: parsed.company || '',
        contract_no: parsed.contract_no || '',
        location: parsed.location || '',
        work_content: parsed.work_content || '',
        work_time: parsed.work_time || '',
        mid_shift: Number(parsed.mid_shift) || 0,
        ot: Number(parsed.ot) || 0,
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

    // 匹配 HH:MM-HH:MM 或 HH:MM~HH:MM 或 HH:MM～HH:MM
    const match = timeStr.match(/(\d{1,2}:\d{2})\s*[-~～至到]\s*(\d{1,2}:\d{2})/);
    if (match) {
      return { startTime: match[1], endTime: match[2] };
    }

    // 只有一個時間
    const single = timeStr.match(/(\d{1,2}:\d{2})/);
    if (single) {
      return { startTime: single[1], endTime: null };
    }

    return { startTime: null, endTime: null };
  }
}
