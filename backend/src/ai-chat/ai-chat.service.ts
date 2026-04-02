import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class AiChatService {
  private openai: OpenAI;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[AiChatService] OPENAI_API_KEY is not set!');
    } else {
      console.log('[AiChatService] OPENAI_API_KEY loaded, prefix:', apiKey.substring(0, 7) + '...');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async chat(messages: any[]) {
    const systemPrompt = `你是一個專業的建築工程 ERP 系統智能助手，名叫「工程助手」。你擁有查詢系統內所有數據的能力。

## 你的完整能力

### 可查詢的數據（使用對應工具）
- **公司**：公司列表、數量、類型（getCompanies）
- **員工**：員工列表、數量、在職/離職狀態、角色（getEmployees）
- **車輛**：車輛列表、數量、牌照、狀態、保險到期（getVehicles）
- **機械**：機械列表、數量、類型、狀態（getMachinery）
- **合作夥伴/客戶**：客戶、供應商列表（getPartners）
- **項目**：項目列表、狀態（getProjects）
- **合約**：合約列表、詳情（getContracts、getContractDetail）
- **變更指令（VO）**：VO 列表、狀態（getVariationOrders）
- **期中付款申請（IPA）**：IPA 列表、狀態（getInterimPayments）
- **費用**：費用記錄、未付費用（getExpenses）
- **薪資**：薪資記錄（getPayrolls）
- **發票**：發票列表、未收款（getInvoices）
- **工作日誌**：工作記錄（getWorkLogs）
- **請假記錄**：員工請假（getLeaves）
- **財務摘要**：全公司財務概覽（getFinancialSummary）
- **系統提醒**：待處理事項（getAlerts）

### 可執行的操作
- 更新項目狀態（updateProjectStatus）

## 回答規則
- 使用繁體中文回答
- 金額顯示用 HKD，加千位分隔符（如 $1,234,567）
- 如果用戶問題模糊，先確認再執行
- 執行寫入操作前，先向用戶確認
- 表格數據用清晰的格式呈現
- 如查無數據，告知用戶並建議可能的原因
- 當用戶問「有多少」時，直接使用工具查詢並給出數字答案

## 安全規則
- 不能刪除任何數據
- 修改操作需要用戶明確確認
- 不要編造不存在的數據

## 常用術語
- IPA = Interim Payment Application 期中付款申請（系統中對應 PaymentApplication）
- VO = Variation Order 變更指令
- BQ = Bill of Quantities 工程量清單
- Retention = 保留金/扣留金
- Certified Amount = 核准金額
- Payment Certificate = 付款證書`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      // ── 公司 ──
      {
        type: 'function',
        function: {
          name: 'getCompanies',
          description: '查詢公司列表及數量。可按狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '公司狀態，不填則查全部' },
            },
          },
        },
      },
      // ── 員工 ──
      {
        type: 'function',
        function: {
          name: 'getEmployees',
          description: '查詢員工列表及數量。可按在職狀態、角色、公司篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '在職狀態：active=在職，inactive=離職，不填則查全部' },
              role: { type: 'string', description: '員工角色，如 worker、driver、operator 等' },
              companyId: { type: 'number', description: '公司 ID' },
              search: { type: 'string', description: '按姓名搜尋' },
            },
          },
        },
      },
      // ── 車輛 ──
      {
        type: 'function',
        function: {
          name: 'getVehicles',
          description: '查詢車輛列表及數量。可按狀態、公司篩選。包含保險到期日等資訊。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '車輛狀態' },
              companyId: { type: 'number', description: '公司 ID' },
            },
          },
        },
      },
      // ── 機械 ──
      {
        type: 'function',
        function: {
          name: 'getMachinery',
          description: '查詢機械設備列表及數量。可按狀態、類型篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '機械狀態' },
              machineType: { type: 'string', description: '機械類型' },
            },
          },
        },
      },
      // ── 合作夥伴 ──
      {
        type: 'function',
        function: {
          name: 'getPartners',
          description: '查詢合作夥伴（客戶、供應商等）列表及數量。',
          parameters: {
            type: 'object',
            properties: {
              partnerType: { type: 'string', description: '夥伴類型，如 client、supplier、subcontractor 等' },
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '狀態' },
              search: { type: 'string', description: '按名稱搜尋' },
            },
          },
        },
      },
      // ── 項目 ──
      {
        type: 'function',
        function: {
          name: 'getProjects',
          description: '查詢工程項目列表及數量。可按狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'pending', 'completed', 'all'], description: '項目狀態' },
              search: { type: 'string', description: '按名稱搜尋' },
            },
          },
        },
      },
      // ── 合約 ──
      {
        type: 'function',
        function: {
          name: 'getContracts',
          description: '查詢合約列表及數量。可按狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', description: '合約狀態' },
              search: { type: 'string', description: '按編號或名稱搜尋' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getContractDetail',
          description: '查詢單一合約的詳細資料，包括 BQ 項目、VO、IPA 摘要。',
          parameters: {
            type: 'object',
            properties: {
              contractNo: { type: 'string', description: '合約編號' },
            },
            required: ['contractNo'],
          },
        },
      },
      // ── 變更指令 ──
      {
        type: 'function',
        function: {
          name: 'getVariationOrders',
          description: '查詢變更指令（VO）列表及數量。可按合約編號、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              contractNo: { type: 'string', description: '合約編號' },
              status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected', 'all'] },
            },
          },
        },
      },
      // ── 期中付款申請 ──
      {
        type: 'function',
        function: {
          name: 'getInterimPayments',
          description: '查詢期中付款申請（IPA）列表及數量。可按合約編號、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              contractNo: { type: 'string', description: '合約編號' },
              status: { type: 'string', enum: ['draft', 'submitted', 'certified', 'paid', 'void', 'all'] },
            },
          },
        },
      },
      // ── 費用 ──
      {
        type: 'function',
        function: {
          name: 'getExpenses',
          description: '查詢費用記錄及總額。可按付款狀態、日期範圍篩選。',
          parameters: {
            type: 'object',
            properties: {
              isPaid: { type: 'boolean', description: '是否已付款，不填則查全部' },
              dateFrom: { type: 'string', description: '開始日期 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '結束日期 YYYY-MM-DD' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 薪資 ──
      {
        type: 'function',
        function: {
          name: 'getPayrolls',
          description: '查詢薪資記錄。可按期間、員工、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              period: { type: 'string', description: '薪資期間，如 2024-01' },
              status: { type: 'string', enum: ['draft', 'confirmed', 'paid', 'all'], description: '薪資狀態' },
              employeeName: { type: 'string', description: '員工姓名搜尋' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 發票 ──
      {
        type: 'function',
        function: {
          name: 'getInvoices',
          description: '查詢發票列表及數量。可按狀態、客戶篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['draft', 'issued', 'partially_paid', 'paid', 'void', 'all'], description: '發票狀態' },
              search: { type: 'string', description: '按發票號碼或客戶名稱搜尋' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 工作日誌 ──
      {
        type: 'function',
        function: {
          name: 'getWorkLogs',
          description: '查詢工作日誌記錄。可按日期範圍、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              dateFrom: { type: 'string', description: '開始日期 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '結束日期 YYYY-MM-DD' },
              status: { type: 'string', description: '狀態，如 editing、submitted、confirmed' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 請假記錄 ──
      {
        type: 'function',
        function: {
          name: 'getLeaves',
          description: '查詢員工請假記錄。可按狀態、員工篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], description: '請假狀態' },
              employeeName: { type: 'string', description: '員工姓名搜尋' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 財務摘要 ──
      {
        type: 'function',
        function: {
          name: 'getFinancialSummary',
          description: '查詢財務摘要：總合約額、已認證金額、待收款、費用等。可查單一項目或全公司。',
          parameters: {
            type: 'object',
            properties: {
              projectNo: { type: 'string', description: '項目編號，不填則查全公司' },
            },
          },
        },
      },
      // ── 系統提醒 ──
      {
        type: 'function',
        function: {
          name: 'getAlerts',
          description: '查詢系統提醒：待審批 VO、未認證 IPA、即將到期的保險/牌照等。',
          parameters: { type: 'object', properties: {} },
        },
      },
      // ── 更新項目狀態 ──
      {
        type: 'function',
        function: {
          name: 'updateProjectStatus',
          description: '更新項目狀態。執行前必須先向用戶確認。',
          parameters: {
            type: 'object',
            properties: {
              projectNo: { type: 'string', description: '項目編號' },
              newStatus: { type: 'string', enum: ['active', 'pending', 'completed'] },
            },
            required: ['projectNo', 'newStatus'],
          },
        },
      },
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools,
      stream: true,
    });

    return response;
  }

  async handleToolCall(toolCall: any) {
    const name = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    switch (name) {
      case 'getCompanies':
        return this.getCompanies(args.status);
      case 'getEmployees':
        return this.getEmployees(args.status, args.role, args.companyId, args.search);
      case 'getVehicles':
        return this.getVehicles(args.status, args.companyId);
      case 'getMachinery':
        return this.getMachinery(args.status, args.machineType);
      case 'getPartners':
        return this.getPartners(args.partnerType, args.status, args.search);
      case 'getProjects':
        return this.getProjects(args.status, args.search);
      case 'getContracts':
        return this.getContracts(args.status, args.search);
      case 'getContractDetail':
        return this.getContractDetail(args.contractNo);
      case 'getVariationOrders':
        return this.getVariationOrders(args.contractNo, args.status);
      case 'getInterimPayments':
        return this.getInterimPayments(args.contractNo, args.status);
      case 'getExpenses':
        return this.getExpenses(args.isPaid, args.dateFrom, args.dateTo, args.limit);
      case 'getPayrolls':
        return this.getPayrolls(args.period, args.status, args.employeeName, args.limit);
      case 'getInvoices':
        return this.getInvoices(args.status, args.search, args.limit);
      case 'getWorkLogs':
        return this.getWorkLogs(args.dateFrom, args.dateTo, args.status, args.limit);
      case 'getLeaves':
        return this.getLeaves(args.status, args.employeeName, args.limit);
      case 'getFinancialSummary':
        return this.getFinancialSummary(args.projectNo);
      case 'getAlerts':
        return this.getAlerts();
      case 'updateProjectStatus':
        return this.updateProjectStatus(args.projectNo, args.newStatus);
      default:
        return { error: `工具 ${name} 尚未實作` };
    }
  }

  // ════════════════════════════════════════════════════
  // Tool Implementations
  // ════════════════════════════════════════════════════

  private async getCompanies(status?: string) {
    const where = status && status !== 'all' ? { status } : {};
    const companies = await this.prisma.company.findMany({
      where,
      select: { id: true, name: true, name_en: true, company_type: true, status: true, internal_prefix: true },
      orderBy: { name: 'asc' },
    });
    return {
      count: companies.length,
      companies: companies.map(c => ({
        id: c.id,
        name: c.name,
        name_en: c.name_en,
        type: c.company_type,
        status: c.status,
        prefix: c.internal_prefix,
      })),
    };
  }

  private async getEmployees(status?: string, role?: string, companyId?: number, search?: string) {
    const now = new Date();
    let where: any = {};

    if (status === 'active') {
      where.OR = [
        { termination_date: null },
        { termination_date: { gt: now } },
      ];
    } else if (status === 'inactive') {
      where.termination_date = { lte: now };
    }

    if (role) where.role = { contains: role, mode: 'insensitive' };
    if (companyId) where.company_id = companyId;
    if (search) {
      where.OR = [
        { name_zh: { contains: search, mode: 'insensitive' } },
        { name_en: { contains: search, mode: 'insensitive' } },
        { emp_code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const employees = await this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        emp_code: true,
        name_zh: true,
        name_en: true,
        role: true,
        phone: true,
        join_date: true,
        termination_date: true,
        company: { select: { name: true } },
      },
      orderBy: { name_zh: 'asc' },
      take: 20,
    });

    const total = await this.prisma.employee.count({ where });

    return {
      count: total,
      shown: employees.length,
      employees: employees.map(e => ({
        code: e.emp_code,
        name: e.name_zh,
        name_en: e.name_en,
        role: e.role,
        company: e.company?.name,
        join_date: e.join_date,
        status: e.termination_date && e.termination_date <= new Date() ? '離職' : '在職',
      })),
    };
  }

  private async getVehicles(status?: string, companyId?: number) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (companyId) where.owner_company_id = companyId;

    const vehicles = await this.prisma.vehicle.findMany({
      where,
      select: {
        id: true,
        plate_number: true,
        vehicle_type: true,
        tonnage: true,
        status: true,
        insurance_expiry: true,
        license_expiry: true,
        brand: true,
        model: true,
        owner_company: { select: { name: true } },
      },
      orderBy: { plate_number: 'asc' },
      take: 20,
    });

    const total = await this.prisma.vehicle.count({ where });
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      count: total,
      shown: vehicles.length,
      vehicles: vehicles.map(v => ({
        plate: v.plate_number,
        type: v.vehicle_type,
        tonnage: v.tonnage,
        brand: v.brand,
        model: v.model,
        company: v.owner_company?.name,
        status: v.status,
        insurance_expiry: v.insurance_expiry,
        license_expiry: v.license_expiry,
        insurance_expiring_soon: v.insurance_expiry && v.insurance_expiry <= thirtyDaysLater,
      })),
    };
  }

  private async getMachinery(status?: string, machineType?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (machineType) where.machine_type = { contains: machineType, mode: 'insensitive' };

    const machines = await this.prisma.machinery.findMany({
      where,
      select: {
        id: true,
        machine_code: true,
        machine_type: true,
        brand: true,
        model: true,
        tonnage: true,
        status: true,
        inspection_cert_expiry: true,
        insurance_expiry: true,
        owner_company: { select: { name: true } },
      },
      orderBy: { machine_code: 'asc' },
      take: 20,
    });

    const total = await this.prisma.machinery.count({ where });

    return {
      count: total,
      shown: machines.length,
      machinery: machines.map(m => ({
        code: m.machine_code,
        type: m.machine_type,
        brand: m.brand,
        model: m.model,
        tonnage: m.tonnage,
        company: m.owner_company?.name,
        status: m.status,
        inspection_expiry: m.inspection_cert_expiry,
        insurance_expiry: m.insurance_expiry,
      })),
    };
  }

  private async getPartners(partnerType?: string, status?: string, search?: string) {
    const where: any = {};
    if (partnerType) where.partner_type = { contains: partnerType, mode: 'insensitive' };
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { name_en: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const partners = await this.prisma.partner.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        name_en: true,
        partner_type: true,
        contact_person: true,
        phone: true,
        status: true,
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    const total = await this.prisma.partner.count({ where });

    return {
      count: total,
      shown: partners.length,
      partners: partners.map(p => ({
        code: p.code,
        name: p.name,
        name_en: p.name_en,
        type: p.partner_type,
        contact: p.contact_person,
        phone: p.phone,
        status: p.status,
      })),
    };
  }

  private async getProjects(status?: string, search?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (search) where.project_name = { contains: search, mode: 'insensitive' };

    const total = await this.prisma.project.count({ where });
    const projects = await this.prisma.project.findMany({
      where,
      include: {
        company: { select: { name: true } },
        _count: { select: { payment_applications: true } },
      },
      take: 15,
      orderBy: { created_at: 'desc' },
    });

    return {
      count: total,
      shown: projects.length,
      projects: projects.map(p => ({
        project_no: p.project_no,
        name: p.project_name,
        status: p.status,
        company: p.company?.name,
        ipa_count: p._count.payment_applications,
      })),
    };
  }

  private async getContracts(status?: string, search?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { contract_no: { contains: search, mode: 'insensitive' } },
        { contract_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.contract.count({ where });
    const contracts = await this.prisma.contract.findMany({
      where,
      include: { client: { select: { name: true } } },
      take: 15,
      orderBy: { created_at: 'desc' },
    });

    return {
      count: total,
      shown: contracts.length,
      contracts: contracts.map(c => ({
        contract_no: c.contract_no,
        name: c.contract_name,
        client: c.client?.name,
        amount: c.original_amount,
        status: c.status,
      })),
    };
  }

  private async getContractDetail(contractNo: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { contract_no: contractNo },
      include: {
        client: true,
        bq_items: { take: 10 },
        variation_orders: { take: 5 },
        payment_applications: { orderBy: { pa_no: 'desc' }, take: 3 },
      },
    });
    if (!contract) return { error: `找不到合約 ${contractNo}` };
    return {
      contract_no: contract.contract_no,
      name: contract.contract_name,
      client: contract.client?.name,
      original_amount: contract.original_amount,
      status: contract.status,
      bq_count: contract.bq_items.length,
      recent_vos: contract.variation_orders.map(v => ({ no: v.vo_no, title: v.title, amount: v.total_amount, status: v.status })),
      recent_ipas: contract.payment_applications.map(p => ({ no: p.pa_no, amount: p.certified_amount, status: p.status })),
    };
  }

  private async getVariationOrders(contractNo?: string, status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (contractNo) where.contract = { contract_no: contractNo };

    const total = await this.prisma.variationOrder.count({ where });
    const vos = await this.prisma.variationOrder.findMany({
      where,
      include: { contract: { select: { contract_no: true } } },
      orderBy: { created_at: 'desc' },
      take: 15,
    });

    return {
      count: total,
      shown: vos.length,
      variation_orders: vos.map(v => ({
        vo_no: v.vo_no,
        contract_no: v.contract?.contract_no,
        title: v.title,
        amount: v.total_amount,
        status: v.status,
      })),
    };
  }

  private async getInterimPayments(contractNo?: string, status?: string) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (contractNo) where.contract = { contract_no: contractNo };

    const total = await this.prisma.paymentApplication.count({ where });
    const ipas = await this.prisma.paymentApplication.findMany({
      where,
      include: { contract: { select: { contract_no: true } } },
      orderBy: { pa_no: 'desc' },
      take: 15,
    });

    return {
      count: total,
      shown: ipas.length,
      interim_payments: ipas.map(p => ({
        pa_no: p.pa_no,
        contract_no: p.contract?.contract_no,
        period_to: p.period_to,
        certified_amount: p.certified_amount,
        paid_amount: p.paid_amount,
        status: p.status,
      })),
    };
  }

  private async getExpenses(isPaid?: boolean, dateFrom?: string, dateTo?: string, limit?: number) {
    const where: any = {};
    if (isPaid !== undefined) where.is_paid = isPaid;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const total = await this.prisma.expense.count({ where });
    const totalAmount = await this.prisma.expense.aggregate({
      where,
      _sum: { total_amount: true },
    });

    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        id: true,
        date: true,
        item: true,
        total_amount: true,
        is_paid: true,
        payment_method: true,
        supplier_name: true,
        category: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit || 10,
    });

    return {
      count: total,
      total_amount: totalAmount._sum.total_amount,
      shown: expenses.length,
      expenses: expenses.map(e => ({
        id: e.id,
        date: e.date,
        item: e.item,
        amount: e.total_amount,
        is_paid: e.is_paid,
        payment_method: e.payment_method,
        supplier: e.supplier_name,
        category: e.category?.name,
      })),
    };
  }

  private async getPayrolls(period?: string, status?: string, employeeName?: string, limit?: number) {
    const where: any = {};
    if (period) where.period = { contains: period };
    if (status && status !== 'all') where.status = status;
    if (employeeName) {
      where.employee = {
        OR: [
          { name_zh: { contains: employeeName, mode: 'insensitive' } },
          { name_en: { contains: employeeName, mode: 'insensitive' } },
        ],
      };
    }

    const total = await this.prisma.payroll.count({ where });
    const totalAmount = await this.prisma.payroll.aggregate({
      where,
      _sum: { net_amount: true },
    });

    const payrolls = await this.prisma.payroll.findMany({
      where,
      select: {
        id: true,
        period: true,
        date_from: true,
        date_to: true,
        net_amount: true,
        status: true,
        employee: { select: { name_zh: true, emp_code: true } },
      },
      orderBy: [{ period: 'desc' }, { id: 'desc' }],
      take: limit || 10,
    });

    return {
      count: total,
      total_net_amount: totalAmount._sum.net_amount,
      shown: payrolls.length,
      payrolls: payrolls.map(p => ({
        id: p.id,
        period: p.period,
        date_from: p.date_from,
        date_to: p.date_to,
        employee: p.employee?.name_zh,
        emp_code: p.employee?.emp_code,
        net_amount: p.net_amount,
        status: p.status,
      })),
    };
  }

  private async getInvoices(status?: string, search?: string, limit?: number) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { invoice_no: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const total = await this.prisma.invoice.count({ where });
    const totalOutstanding = await this.prisma.invoice.aggregate({
      where,
      _sum: { outstanding: true, total_amount: true },
    });

    const invoices = await this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoice_no: true,
        date: true,
        due_date: true,
        total_amount: true,
        paid_amount: true,
        outstanding: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit || 10,
    });

    return {
      count: total,
      total_amount: totalOutstanding._sum.total_amount,
      total_outstanding: totalOutstanding._sum.outstanding,
      shown: invoices.length,
      invoices: invoices.map(i => ({
        invoice_no: i.invoice_no,
        date: i.date,
        due_date: i.due_date,
        client: i.client?.name,
        total_amount: i.total_amount,
        paid_amount: i.paid_amount,
        outstanding: i.outstanding,
        status: i.status,
      })),
    };
  }

  private async getWorkLogs(dateFrom?: string, dateTo?: string, status?: string, limit?: number) {
    const where: any = {};
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.scheduled_date = {};
      if (dateFrom) where.scheduled_date.gte = new Date(dateFrom);
      if (dateTo) where.scheduled_date.lte = new Date(dateTo);
    }

    const total = await this.prisma.workLog.count({ where });
    const workLogs = await this.prisma.workLog.findMany({
      where,
      select: {
        id: true,
        scheduled_date: true,
        service_type: true,
        status: true,
        start_location: true,
        end_location: true,
        employee: { select: { name_zh: true } },
        client: { select: { name: true } },
      },
      orderBy: { scheduled_date: 'desc' },
      take: limit || 10,
    });

    return {
      count: total,
      shown: workLogs.length,
      work_logs: workLogs.map(w => ({
        id: w.id,
        date: w.scheduled_date,
        service_type: w.service_type,
        status: w.status,
        employee: w.employee?.name_zh,
        client: w.client?.name,
        from: w.start_location,
        to: w.end_location,
      })),
    };
  }

  private async getLeaves(status?: string, employeeName?: string, limit?: number) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (employeeName) {
      where.employee = {
        OR: [
          { name_zh: { contains: employeeName, mode: 'insensitive' } },
          { name_en: { contains: employeeName, mode: 'insensitive' } },
        ],
      };
    }

    const total = await this.prisma.employeeLeave.count({ where });
    const leaves = await this.prisma.employeeLeave.findMany({
      where,
      select: {
        id: true,
        leave_type: true,
        date_from: true,
        date_to: true,
        days: true,
        status: true,
        reason: true,
        employee: { select: { name_zh: true, emp_code: true } },
      },
      orderBy: { date_from: 'desc' },
      take: limit || 10,
    });

    return {
      count: total,
      shown: leaves.length,
      leaves: leaves.map(l => ({
        id: l.id,
        employee: l.employee?.name_zh,
        emp_code: l.employee?.emp_code,
        leave_type: l.leave_type,
        date_from: l.date_from,
        date_to: l.date_to,
        days: l.days,
        status: l.status,
        reason: l.reason,
      })),
    };
  }

  private async getFinancialSummary(projectNo?: string) {
    const contractWhere = projectNo ? { projects: { some: { project_no: projectNo } } } : {};
    const contracts = await this.prisma.contract.findMany({
      where: contractWhere,
      include: {
        payment_applications: true,
        variation_orders: { where: { status: 'approved' } },
      },
    });

    let totalOriginal = 0;
    let totalCertified = 0;
    let totalPaid = 0;
    let totalVo = 0;

    contracts.forEach(c => {
      totalOriginal += Number(c.original_amount);
      c.payment_applications.forEach(p => {
        totalCertified += Number(p.certified_amount || 0);
        totalPaid += Number(p.paid_amount || 0);
      });
      c.variation_orders.forEach(v => {
        totalVo += Number(v.approved_amount || 0);
      });
    });

    // Also get expense summary
    const expenseSummary = await this.prisma.expense.aggregate({
      _sum: { total_amount: true },
    });
    const unpaidExpenses = await this.prisma.expense.aggregate({
      where: { is_paid: false },
      _sum: { total_amount: true },
    });

    return {
      contract_count: contracts.length,
      total_original_amount: totalOriginal,
      total_approved_vo_amount: totalVo,
      revised_total_amount: totalOriginal + totalVo,
      total_certified_amount: totalCertified,
      total_paid_amount: totalPaid,
      outstanding_receivable: totalCertified - totalPaid,
      total_expenses: expenseSummary._sum.total_amount,
      unpaid_expenses: unpaidExpenses._sum.total_amount,
    };
  }

  private async getAlerts() {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      pendingVOs,
      draftIPAs,
      submittedIPAs,
      unpaidExpenses,
      pendingLeaves,
      expiringVehicleInsurance,
      expiringMachineryInsurance,
    ] = await Promise.all([
      this.prisma.variationOrder.count({ where: { status: 'submitted' } }),
      this.prisma.paymentApplication.count({ where: { status: 'draft' } }),
      this.prisma.paymentApplication.count({ where: { status: 'submitted' } }),
      this.prisma.expense.count({ where: { is_paid: false } }),
      this.prisma.employeeLeave.count({ where: { status: 'pending' } }),
      this.prisma.vehicle.count({
        where: {
          status: 'active',
          insurance_expiry: { lte: thirtyDaysLater, gte: now },
        },
      }),
      this.prisma.machinery.count({
        where: {
          status: 'active',
          insurance_expiry: { lte: thirtyDaysLater, gte: now },
        },
      }),
    ]);

    return {
      pending_vo_approvals: pendingVOs,
      draft_ipas: draftIPAs,
      submitted_ipas_awaiting_certification: submittedIPAs,
      unpaid_expenses: unpaidExpenses,
      pending_leave_requests: pendingLeaves,
      vehicles_insurance_expiring_30days: expiringVehicleInsurance,
      machinery_insurance_expiring_30days: expiringMachineryInsurance,
      summary: `⚠️ 待處理事項：${pendingVOs} 個 VO 待審批、${submittedIPAs} 個 IPA 待核准、${unpaidExpenses} 筆未付費用、${pendingLeaves} 個請假申請待批、${expiringVehicleInsurance} 輛車輛保險即將到期。`,
    };
  }

  private async updateProjectStatus(projectNo: string, newStatus: string) {
    const project = await this.prisma.project.findUnique({ where: { project_no: projectNo } });
    if (!project) return { error: `找不到項目 ${projectNo}` };

    await this.prisma.project.update({
      where: { project_no: projectNo },
      data: { status: newStatus },
    });

    return { success: true, message: `項目 ${projectNo} 狀態已更新為 ${newStatus}` };
  }
}
