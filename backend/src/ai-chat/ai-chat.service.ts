import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class AiChatService {
  private openai: OpenAI;

  constructor(private prisma: PrismaService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async chat(messages: any[]) {
    const systemPrompt = `你是一個專業的建築工程 ERP 系統智能助手，名叫「工程助手」。

## 你的能力
1. **查詢數據**：查詢項目、合約、BQ、VO、IPA 等資料
2. **執行操作**：建立 IPA 草稿、建立 VO、提交審批、更新狀態
3. **分析建議**：分析財務狀況、提供專業建議
4. **系統提醒**：檢查待處理事項、過期付款

## 回答規則
- 使用繁體中文回答
- 金額顯示用 HKD，加千位分隔符（如 $1,234,567）
- 如果用戶問題模糊，先確認再執行
- 執行寫入操作前，先向用戶確認
- 表格數據用清晰的格式呈現
- 如查無數據，建議用戶檢查輸入

## 安全規則
- 不能刪除任何數據
- 修改操作需要用戶明確確認
- 不要編造不存在的數據

## 系統模組
目前系統包含：
- 項目管理（Project）
- 合約管理（Contract）
- 工程量清單（BQ - Bill of Quantities）
- 變更指令（VO - Variation Order）
- 期中付款申請（IPA - Interim Payment Application / PaymentApplication）

## 常用術語
- IPA = Interim Payment Application 期中付款申請 (系統中對應 PaymentApplication)
- VO = Variation Order 變更指令
- BQ = Bill of Quantities 工程量清單
- Retention = 保留金/扣留金
- Certified Amount = 核准金額
- Payment Certificate = 付款證書`;

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: 'getProjects',
          description: '查詢項目列表。可按狀態篩選。回傳項目名稱、狀態、合約數量。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'pending', 'completed', 'all'], description: '項目狀態' },
              search: { type: 'string', description: '按名稱搜尋' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getContracts',
          description: '查詢合約列表。可按狀態篩選。回傳合約編號、金額、狀態。',
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
      {
        type: 'function',
        function: {
          name: 'getVariationOrders',
          description: '查詢變更指令（Variation Orders），可按合約編號、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              contractNo: { type: 'string', description: '合約編號' },
              status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected', 'all'] },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getInterimPayments',
          description: '查詢期中付款申請（IPA/PaymentApplication），可按合約編號、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              contractNo: { type: 'string', description: '合約編號' },
              status: { type: 'string', enum: ['draft', 'submitted', 'certified', 'paid', 'void', 'all'] },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getFinancialSummary',
          description: '查詢財務摘要：總合約額、已認證金額、待收款等。可查單一項目或全公司。',
          parameters: {
            type: 'object',
            properties: {
              projectNo: { type: 'string', description: '項目編號，不填則查全公司' },
            },
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getAlerts',
          description: '查詢系統提醒：待審批 VO、未認證 IPA 等。',
          parameters: { type: 'object', properties: {} },
        },
      },
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
      case 'getFinancialSummary':
        return this.getFinancialSummary(args.projectNo);
      case 'getAlerts':
        return this.getAlerts();
      case 'updateProjectStatus':
        return this.updateProjectStatus(args.projectNo, args.newStatus);
      default:
        return { error: `Tool ${name} not implemented` };
    }
  }

  // --- Tool Implementations ---

  private async getProjects(status?: string, search?: string) {
    const projects = await this.prisma.project.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(search ? { project_name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        company: { select: { name: true } },
        _count: { select: { payment_applications: true } },
      },
      take: 10,
    });
    return projects.map(p => ({
      project_no: p.project_no,
      name: p.project_name,
      status: p.status,
      company: p.company.name,
      ipa_count: p._count.payment_applications,
    }));
  }

  private async getContracts(status?: string, search?: string) {
    const contracts = await this.prisma.contract.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(search ? {
          OR: [
            { contract_no: { contains: search, mode: 'insensitive' } },
            { contract_name: { contains: search, mode: 'insensitive' } },
          ]
        } : {}),
      },
      include: {
        client: { select: { name: true } },
      },
      take: 10,
    });
    return contracts.map(c => ({
      contract_no: c.contract_no,
      name: c.contract_name,
      client: c.client.name,
      amount: c.original_amount,
      status: c.status,
    }));
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
    if (!contract) return { error: '找不到該合約' };
    return {
      contract_no: contract.contract_no,
      name: contract.contract_name,
      client: contract.client.name,
      original_amount: contract.original_amount,
      status: contract.status,
      bq_count: contract.bq_items.length,
      recent_vos: contract.variation_orders.map(v => ({ no: v.vo_no, title: v.title, amount: v.total_amount, status: v.status })),
      recent_ipas: contract.payment_applications.map(p => ({ no: p.pa_no, amount: p.certified_amount, status: p.status })),
    };
  }

  private async getVariationOrders(contractNo?: string, status?: string) {
    const vos = await this.prisma.variationOrder.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(contractNo ? { contract: { contract_no: contractNo } } : {}),
      },
      include: { contract: { select: { contract_no: true } } },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    return vos.map(v => ({
      vo_no: v.vo_no,
      contract_no: v.contract.contract_no,
      title: v.title,
      amount: v.total_amount,
      status: v.status,
    }));
  }

  private async getInterimPayments(contractNo?: string, status?: string) {
    const ipas = await this.prisma.paymentApplication.findMany({
      where: {
        ...(status && status !== 'all' ? { status } : {}),
        ...(contractNo ? { contract: { contract_no: contractNo } } : {}),
      },
      include: { contract: { select: { contract_no: true } } },
      orderBy: { pa_no: 'desc' },
      take: 10,
    });
    return ipas.map(p => ({
      pa_no: p.pa_no,
      contract_no: p.contract.contract_no,
      period_to: p.period_to,
      amount: p.certified_amount,
      status: p.status,
    }));
  }

  private async getFinancialSummary(projectNo?: string) {
    const contracts = await this.prisma.contract.findMany({
      where: projectNo ? { projects: { some: { project_no: projectNo } } } : {},
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

    return {
      contract_count: contracts.length,
      total_original_amount: totalOriginal,
      total_approved_vo_amount: totalVo,
      revised_total_amount: totalOriginal + totalVo,
      total_certified_amount: totalCertified,
      total_paid_amount: totalPaid,
      outstanding_receivable: totalCertified - totalPaid,
    };
  }

  private async getAlerts() {
    const pendingVOs = await this.prisma.variationOrder.count({ where: { status: 'submitted' } });
    const draftIPAs = await this.prisma.paymentApplication.count({ where: { status: 'draft' } });
    const submittedIPAs = await this.prisma.paymentApplication.count({ where: { status: 'submitted' } });

    return {
      pending_vo_count: pendingVOs,
      draft_ipa_count: draftIPAs,
      submitted_ipa_count: submittedIPAs,
      summary: `目前有 ${pendingVOs} 個 VO 待審批，${draftIPAs} 個 IPA 草稿，${submittedIPAs} 個 IPA 待核准。`,
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
