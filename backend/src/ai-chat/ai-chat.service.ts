import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { createOpenAIClient } from '../common/openai-client';

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
    this.openai = createOpenAIClient();
  }

  private getPromptAndTools() {
    const systemPrompt = `你是明達建築有限公司（Mingtat Construction）的 ERP 系統智能助手，名叫「工程助手」。

## 公司背景
明達建築是一間香港建築工程公司，主要業務包括：
- **運輸服務**：車輛（泥頭車、吊機等）運輸廢料、建材
- **工程服務**：建築、拆卸、地基工程
- **機械服務**：挖掘機、壓路機等機械出租及操作
- **分包服務**：向主承建商提供分包工程

公司旗下有多間相關公司（明達建築、明達運輸等），員工包括司機、工人、機械操作員等。

## 你的完整查詢能力

### 基本資料
- **公司**：公司列表、數量、類型（getCompanies）
- **公司商業登記/公司資料**：BR 號碼、BR 到期日、CR、分包商牌照（getCompanyProfiles）
- **員工**：員工列表、在職/離職狀態、角色（getEmployees）
- **車輛**：車牌號碼、車輛保險到期、牌照到期（getVehicles）
- **機械**：機械列表、類型、保險到期（getMachinery）
- **合作夥伴/客戶**：客戶、供應商列表（getPartners）

### 工程管理
- **項目**：項目列表、狀態（getProjects）
- **合約**：合約列表、詳情（getContracts、getContractDetail）
- **變更指令（VO）**：VO 列表、狀態（getVariationOrders）
- **期中付款申請（IPA）**：IPA 列表、狀態（getInterimPayments）
- **報價單**：報價單列表、詳情（getQuotations）

### 日常運作
- **工作日誌**：WhatsApp 報工記錄、工作紀錄（getWorkLogs）
- **打卡記錄**：員工上下班打卡（getAttendances）
- **請假記錄**：員工請假（getLeaves）

### 核對資料
- **核對記錄**：收據核對記錄、配對狀態（getVerificationRecords）
- **WhatsApp 出 Order**：WhatsApp 出 order 訊息、order 項目（getWaOrders）

### 財務
- **費用**：費用記錄、未付費用（getExpenses）
- **薪資**：薪資記錄（getPayrolls）
- **發票**：發票列表、未收款（getInvoices）
- **財務摘要**：全公司財務概覽（getFinancialSummary）

### 系統工具
- **系統提醒**：待處理事項（getAlerts）
- **全文搜索**：跨表搜索 ERP 資料（searchERP）

## 工具選擇指引
- 問「商業登記證」、「BR 到期」→ **getCompanyProfiles**
- 問「車輛牌照」、「車輛保險」→ **getVehicles**
- 問「機械保險」、「機械檢驗」→ **getMachinery**
- 問「報工」、「工作記錄」、「打卡報工」→ **getWorkLogs**
- 問「打卡」、「上班打卡」、「出勤」→ **getAttendances**
- 問「出 order」、「WhatsApp order」→ **getWaOrders**
- 問「核對」、「收據核對」→ **getVerificationRecords**
- 問「報價」、「報價單」→ **getQuotations**
- 問題涉及多個範疇或不確定在哪個表 → **searchERP**

## 可執行的操作
- 更新項目狀態（updateProjectStatus）

## 回答規則
- 使用繁體中文回答
- 金額顯示用 HKD，加千位分隔符（如 $1,234,567）
- 如果用戶問題模糊，先確認再執行
- 執行寫入操作前，先向用戶確認
- 表格數據用清晰的格式呈現
- 如查無數據，告知用戶並建議可能的原因
- 當用戶問「有多少」時，直接使用工具查詢並給出數字答案
- 查詢員工時，預設只查在職員工（status=active），除非用戶明確要求查看離職員工或全部員工

## 安全規則
- 不能刪除任何數據
- 修改操作需要用戶明確確認
- 不要編造不存在的數據

## 常用術語
- IPA = Interim Payment Application 期中付款申請
- VO = Variation Order 變更指令
- BQ = Bill of Quantities 工程量清單
- Retention = 保留金/扣留金
- Certified Amount = 核准金額
- Payment Certificate = 付款證書
- 泥頭車 = 運土/廢料的卡車
- 出 order = 工程排班指令（通過 WhatsApp 發出）`;

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
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '在職狀態：active=在職（預設），inactive=離職，all=全部。不填預設查在職員工。' },
              role: { type: 'string', description: '員工角色，如 worker、driver、operator 等' },
              companyId: { type: 'number', description: '公司 ID' },
              search: { type: 'string', description: '按姓名搜尋' },
            },
          },
        },
      },
      // ── 公司商業登記/公司資料 ──
      {
        type: 'function',
        function: {
          name: 'getCompanyProfiles',
          description: '查詢公司商業登記證資料，包含：商業登記證號碼（BR Number）、商業登記證到期日（BR Expiry Date）、公司法人登記（CR）、分包商牌照到期日等。當用戶問「公司商業登記證」、「BR 到期」、「商業登記到期」、「分包商牌照」時，使用此工具。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive', 'all'], description: '公司狀態，不填則查全部' },
              search: { type: 'string', description: '按公司名稱或編號搜尋' },
              expiringBrOnly: { type: 'boolean', description: '如果為 true，只返回商業登記證即將到期或已到期的公司' },
            },
          },
        },
      },
      // ── 車輛 ──
      {
        type: 'function',
        function: {
          name: 'getVehicles',
          description: '查詢車輛列表及數量。可按狀態、公司篩選。包含車輛保險到期日、車輛牌照到期日等資訊。注意：此工具查詢的是「車輛牌照」和「車輛保險」，不是公司商業登記證。如果用戶問的是公司商業登記證，請使用 getCompanyProfiles。',
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
      // ── 打卡記錄 ──
      {
        type: 'function',
        function: {
          name: 'getAttendances',
          description: '查詢員工打卡記錄（上班/下班打卡）。可按日期範圍、員工姓名篩選。',
          parameters: {
            type: 'object',
            properties: {
              dateFrom: { type: 'string', description: '開始日期 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '結束日期 YYYY-MM-DD' },
              employeeName: { type: 'string', description: '員工姓名搜尋' },
              type: { type: 'string', enum: ['clock_in', 'clock_out', 'all'], description: '打卡類型：clock_in=上班，clock_out=下班，不填查全部' },
              limit: { type: 'number', description: '返回筆數，預設 20' },
            },
          },
        },
      },
      // ── 報價單 ──
      {
        type: 'function',
        function: {
          name: 'getQuotations',
          description: '查詢報價單列表。可按狀態、客戶、日期篩選。',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['draft', 'sent', 'approved', 'rejected', 'expired', 'all'], description: '報價單狀態' },
              search: { type: 'string', description: '按報價單號碼、客戶名稱或項目名稱搜尋' },
              dateFrom: { type: 'string', description: '開始日期 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '結束日期 YYYY-MM-DD' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 核對記錄 ──
      {
        type: 'function',
        function: {
          name: 'getVerificationRecords',
          description: '查詢收據核對記錄。可按日期範圍、車輛號碼、配對狀態篩選。核對記錄是收據（receipt）與工作日誌的配對結果。',
          parameters: {
            type: 'object',
            properties: {
              dateFrom: { type: 'string', description: '工作日期開始 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '工作日期結束 YYYY-MM-DD' },
              vehicleNo: { type: 'string', description: '車輛號碼搜尋' },
              matchStatus: { type: 'string', enum: ['matched', 'unmatched', 'disputed', 'all'], description: '配對狀態' },
              limit: { type: 'number', description: '返回筆數，預設 15' },
            },
          },
        },
      },
      // ── WhatsApp 出 Order ──
      {
        type: 'function',
        function: {
          name: 'getWaOrders',
          description: '查詢 WhatsApp 出 order 記錄（工程排班指令）。可按日期範圍、狀態篩選。',
          parameters: {
            type: 'object',
            properties: {
              dateFrom: { type: 'string', description: '開始日期 YYYY-MM-DD' },
              dateTo: { type: 'string', description: '結束日期 YYYY-MM-DD' },
              status: { type: 'string', enum: ['tentative', 'confirmed', 'all'], description: 'order 狀態' },
              search: { type: 'string', description: '按合約號碼、客戶、地點搜尋' },
              limit: { type: 'number', description: '返回筆數，預設 10' },
            },
          },
        },
      },
      // ── 全文搜索 ──
      {
        type: 'function',
        function: {
          name: 'searchERP',
          description: '跨表全文搜索 ERP 資料。當問題涉及多個範疇或不確定在哪個表時使用。可搜索員工、車輛、機械、合約、項目、合作夥伴等。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索關鍵字' },
              tables: {
                type: 'array',
                items: { type: 'string', enum: ['employees', 'vehicles', 'machinery', 'contracts', 'projects', 'partners', 'work_logs', 'invoices', 'quotations'] },
                description: '要搜索的表，不填則搜索全部',
              },
            },
            required: ['query'],
          },
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

    return { systemPrompt, tools };
  }

  /**
   * Complete chat with tool-call loop (non-streaming).
   * Executes the full OpenAI tool-call cycle server-side and returns
   * the final text reply plus a list of tools that were called.
   */
  async chatWithTools(messages: any[]): Promise<{ reply: string; tool_calls: string[] }> {
    const { systemPrompt, tools } = this.getPromptAndTools();
    const currentMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];
    const executedTools: string[] = [];
    const maxRounds = 5;

    for (let round = 0; round < maxRounds; round++) {
      console.log(`[AI Chat] Round ${round + 1}: calling OpenAI (non-streaming) with ${currentMessages.length} messages`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: currentMessages,
        tools,
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;

      console.log(`[AI Chat] Round ${round + 1}: finish_reason=${choice.finish_reason}, tool_calls=${assistantMessage.tool_calls?.length ?? 0}`);

      // If no tool calls, return the final text reply
      if (choice.finish_reason !== 'tool_calls' || !assistantMessage.tool_calls?.length) {
        const reply = assistantMessage.content || '';
        console.log(`[AI Chat] Final reply length: ${reply.length}`);
        return { reply, tool_calls: executedTools };
      }

      // Push the assistant's tool-call message into history
      const toolCalls = assistantMessage.tool_calls as any[];
      currentMessages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: toolCalls.map((tc: any) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      // Execute each tool call
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        console.log(`[AI Chat] Executing tool: ${toolName}`);
        executedTools.push(toolName);

        let toolResult: any;
        try {
          toolResult = await this.handleToolCall(tc);
          console.log(`[AI Chat] Tool ${toolName} succeeded`);
        } catch (toolError: any) {
          console.error(`[AI Chat] Tool ${toolName} error:`, toolError?.message);
          toolResult = { error: toolError?.message || 'Tool execution failed' };
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Continue to next round for the final AI response
    }

    return { reply: '抱歉，處理時間過長，請稍後再試。', tool_calls: executedTools };
  }

  private async handleToolCall(toolCall: any) {
    const name = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    switch (name) {
      case 'getCompanies':
        return this.getCompanies(args.status);
      case 'getCompanyProfiles':
        return this.getCompanyProfiles(args.status, args.search, args.expiringBrOnly);
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
      case 'getAttendances':
        return this.getAttendances(args.dateFrom, args.dateTo, args.employeeName, args.type, args.limit);
      case 'getQuotations':
        return this.getQuotations(args.status, args.search, args.dateFrom, args.dateTo, args.limit);
      case 'getVerificationRecords':
        return this.getVerificationRecords(args.dateFrom, args.dateTo, args.vehicleNo, args.matchStatus, args.limit);
      case 'getWaOrders':
        return this.getWaOrders(args.dateFrom, args.dateTo, args.status, args.search, args.limit);
      case 'searchERP':
        return this.searchERP(args.query, args.tables);
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

  private async getCompanyProfiles(status?: string, search?: string, expiringBrOnly?: boolean) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (search) {
      where.OR = [
        { chinese_name: { contains: search, mode: 'insensitive' } },
        { english_name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const profiles = await this.prisma.companyProfile.findMany({
      where,
      select: {
        id: true,
        code: true,
        chinese_name: true,
        english_name: true,
        br_number: true,
        br_expiry_date: true,
        cr_number: true,
        subcontractor_reg_no: true,
        subcontractor_reg_expiry: true,
        status: true,
      },
      orderBy: { chinese_name: 'asc' },
    });

    const now = new Date();
    const sixtyDaysLater = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const mapped = profiles.map(p => {
      const brExpiry = p.br_expiry_date ? new Date(p.br_expiry_date) : null;
      const brExpired = brExpiry ? brExpiry < now : false;
      const brExpiringSoon = brExpiry ? (brExpiry >= now && brExpiry <= sixtyDaysLater) : false;
      const subExpiry = p.subcontractor_reg_expiry ? new Date(p.subcontractor_reg_expiry) : null;
      const subExpired = subExpiry ? subExpiry < now : false;
      return {
        code: p.code,
        name: p.chinese_name,
        name_en: p.english_name,
        br_number: p.br_number,
        br_expiry_date: p.br_expiry_date,
        br_status: brExpired ? '已到期' : brExpiringSoon ? '即將到期（60天內）' : p.br_expiry_date ? '正常' : '未記錄',
        cr_number: p.cr_number,
        subcontractor_reg_no: p.subcontractor_reg_no,
        subcontractor_reg_expiry: p.subcontractor_reg_expiry,
        subcontractor_reg_status: subExpired ? '已到期' : p.subcontractor_reg_expiry ? '正常' : '未記錄',
        status: p.status,
      };
    });

    const filtered = expiringBrOnly
      ? mapped.filter(p => p.br_status === '已到期' || p.br_status === '即將到期（60天內）')
      : mapped;

    return {
      count: filtered.length,
      total_profiles: profiles.length,
      company_profiles: filtered,
      summary: expiringBrOnly
        ? `找到 ${filtered.length} 間公司的商業登記證即將到期或已到期`
        : `共 ${filtered.length} 間公司的商業登記證資料`,
    };
  }

  private async getEmployees(status?: string, role?: string, companyId?: number, search?: string) {
    let where: any = {};

    // 預設查在職員工，除非明確指定 'all' 或 'inactive'
    const effectiveStatus = status || 'active';
    if (effectiveStatus === 'active') {
      where.status = 'active';
    } else if (effectiveStatus === 'inactive') {
      where.status = 'inactive';
    }
    // effectiveStatus === 'all' 時不加 status 過濾

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
        machine_type: true,
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
        type: v.machine_type,
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

  private async getAttendances(dateFrom?: string, dateTo?: string, employeeName?: string, type?: string, limit?: number) {
    const where: any = {};
    if (type && type !== 'all') where.type = type;
    if (dateFrom || dateTo) {
      where.timestamp = {};
      if (dateFrom) where.timestamp.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.timestamp.lte = end;
      }
    }
    if (employeeName) {
      where.employee = {
        OR: [
          { name_zh: { contains: employeeName, mode: 'insensitive' } },
          { name_en: { contains: employeeName, mode: 'insensitive' } },
        ],
      };
    }

    const total = await this.prisma.employeeAttendance.count({ where });
    const records = await this.prisma.employeeAttendance.findMany({
      where,
      select: {
        id: true,
        type: true,
        timestamp: true,
        attendance_verification_method: true,
        attendance_verification_score: true,
        employee: { select: { name_zh: true, emp_code: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: limit || 20,
    });

    return {
      count: total,
      shown: records.length,
      attendances: records.map(r => ({
        id: r.id,
        employee: r.employee?.name_zh,
        emp_code: r.employee?.emp_code,
        type: r.type === 'clock_in' ? '上班' : '下班',
        timestamp: r.timestamp,
        method: r.attendance_verification_method,
        score: r.attendance_verification_score,
      })),
    };
  }

  private async getQuotations(status?: string, search?: string, dateFrom?: string, dateTo?: string, limit?: number) {
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (dateFrom || dateTo) {
      where.quotation_date = {};
      if (dateFrom) where.quotation_date.gte = new Date(dateFrom);
      if (dateTo) where.quotation_date.lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { quotation_no: { contains: search, mode: 'insensitive' } },
        { contract_name: { contains: search, mode: 'insensitive' } },
        { project_name: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const total = await this.prisma.quotation.count({ where });
    const quotations = await this.prisma.quotation.findMany({
      where,
      select: {
        id: true,
        quotation_no: true,
        quotation_date: true,
        quotation_type: true,
        contract_name: true,
        project_name: true,
        total_amount: true,
        status: true,
        client: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: { quotation_date: 'desc' },
      take: limit || 10,
    });

    const totalAmount = await this.prisma.quotation.aggregate({
      where,
      _sum: { total_amount: true },
    });

    return {
      count: total,
      total_amount: totalAmount._sum.total_amount,
      shown: quotations.length,
      quotations: quotations.map(q => ({
        quotation_no: q.quotation_no,
        date: q.quotation_date,
        type: q.quotation_type,
        name: q.contract_name || q.project_name,
        client: q.client?.name,
        company: q.company?.name,
        total_amount: q.total_amount,
        status: q.status,
      })),
    };
  }

  private async getVerificationRecords(dateFrom?: string, dateTo?: string, vehicleNo?: string, matchStatus?: string, limit?: number) {
    const where: any = {};
    if (dateFrom || dateTo) {
      where.record_work_date = {};
      if (dateFrom) where.record_work_date.gte = new Date(dateFrom);
      if (dateTo) where.record_work_date.lte = new Date(dateTo);
    }
    if (vehicleNo) where.record_vehicle_no = { contains: vehicleNo, mode: 'insensitive' };
    if (matchStatus && matchStatus !== 'all') {
      if (matchStatus === 'matched') {
        where.matches = { some: { match_status: { in: ['auto_matched', 'manual_matched', 'confirmed'] } } };
      } else if (matchStatus === 'unmatched') {
        where.matches = { none: {} };
      } else if (matchStatus === 'disputed') {
        where.matches = { some: { match_status: 'disputed' } };
      }
    }

    const total = await this.prisma.verificationRecord.count({ where });
    const records = await this.prisma.verificationRecord.findMany({
      where,
      select: {
        id: true,
        record_work_date: true,
        record_vehicle_no: true,
        record_driver_name: true,
        record_customer: true,
        record_location_from: true,
        record_location_to: true,
        record_time_in: true,
        record_time_out: true,
        matches: {
          select: { match_status: true, match_confidence: true },
          take: 1,
        },
      },
      orderBy: { record_work_date: 'desc' },
      take: limit || 15,
    });

    return {
      count: total,
      shown: records.length,
      records: records.map(r => ({
        id: r.id,
        work_date: r.record_work_date,
        vehicle_no: r.record_vehicle_no,
        driver: r.record_driver_name,
        customer: r.record_customer,
        from: r.record_location_from,
        to: r.record_location_to,
        time_in: r.record_time_in,
        time_out: r.record_time_out,
        match_status: r.matches[0]?.match_status || 'unmatched',
        match_confidence: r.matches[0]?.match_confidence,
      })),
    };
  }

  private async getWaOrders(dateFrom?: string, dateTo?: string, status?: string, search?: string, limit?: number) {
    const where: any = {};
    if (status && status !== 'all') where.wa_order_status = status;
    if (dateFrom || dateTo) {
      where.wa_order_date = {};
      if (dateFrom) where.wa_order_date.gte = new Date(dateFrom);
      if (dateTo) where.wa_order_date.lte = new Date(dateTo);
    }
    if (search) {
      where.items = {
        some: {
          OR: [
            { wa_item_contract_no: { contains: search, mode: 'insensitive' } },
            { wa_item_customer: { contains: search, mode: 'insensitive' } },
            { wa_item_location: { contains: search, mode: 'insensitive' } },
          ],
        },
      };
    }

    const total = await this.prisma.verificationWaOrder.count({ where });
    const orders = await this.prisma.verificationWaOrder.findMany({
      where,
      include: {
        items: {
          select: {
            wa_item_seq: true,
            wa_item_order_type: true,
            wa_item_contract_no: true,
            wa_item_customer: true,
            wa_item_work_desc: true,
            wa_item_location: true,
            wa_item_vehicle_no: true,
          },
        },
      },
      orderBy: { wa_order_date: 'desc' },
      take: limit || 10,
    });

    return {
      count: total,
      shown: orders.length,
      orders: orders.map(o => ({
        id: o.id,
        date: o.wa_order_date,
        status: o.wa_order_status,
        version: o.wa_order_version,
        sender: o.wa_order_sender_name,
        item_count: o.wa_order_item_count,
        confidence: o.wa_order_ai_confidence,
        items: o.items.map(i => ({
          seq: i.wa_item_seq,
          type: i.wa_item_order_type,
          contract_no: i.wa_item_contract_no,
          customer: i.wa_item_customer,
          work_desc: i.wa_item_work_desc,
          location: i.wa_item_location,
          vehicle_no: i.wa_item_vehicle_no,
        })),
      })),
    };
  }

  private async searchERP(query: string, tables?: string[]) {
    const searchTables = tables && tables.length > 0 ? tables : ['employees', 'vehicles', 'machinery', 'contracts', 'projects', 'partners', 'work_logs', 'invoices', 'quotations'];
    const results: Record<string, any[]> = {};
    const q = query.trim();

    if (searchTables.includes('employees')) {
      const employees = await this.prisma.employee.findMany({
        where: {
          OR: [
            { name_zh: { contains: q, mode: 'insensitive' } },
            { name_en: { contains: q, mode: 'insensitive' } },
            { emp_code: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        },
        select: { emp_code: true, name_zh: true, name_en: true, role: true, status: true },
        take: 5,
      });
      if (employees.length > 0) results.employees = employees;
    }

    if (searchTables.includes('vehicles')) {
      const vehicles = await this.prisma.vehicle.findMany({
        where: {
          OR: [
            { plate_number: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { plate_number: true, machine_type: true, brand: true, model: true, status: true },
        take: 5,
      });
      if (vehicles.length > 0) results.vehicles = vehicles;
    }

    if (searchTables.includes('machinery')) {
      const machinery = await this.prisma.machinery.findMany({
        where: {
          OR: [
            { machine_code: { contains: q, mode: 'insensitive' } },
            { machine_type: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { machine_code: true, machine_type: true, brand: true, model: true, status: true },
        take: 5,
      });
      if (machinery.length > 0) results.machinery = machinery;
    }

    if (searchTables.includes('contracts')) {
      const contracts = await this.prisma.contract.findMany({
        where: {
          OR: [
            { contract_no: { contains: q, mode: 'insensitive' } },
            { contract_name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { contract_no: true, contract_name: true, status: true },
        take: 5,
      });
      if (contracts.length > 0) results.contracts = contracts;
    }

    if (searchTables.includes('projects')) {
      const projects = await this.prisma.project.findMany({
        where: {
          OR: [
            { project_no: { contains: q, mode: 'insensitive' } },
            { project_name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { project_no: true, project_name: true, status: true },
        take: 5,
      });
      if (projects.length > 0) results.projects = projects;
    }

    if (searchTables.includes('partners')) {
      const partners = await this.prisma.partner.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { name_en: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { code: true, name: true, partner_type: true, status: true },
        take: 5,
      });
      if (partners.length > 0) results.partners = partners;
    }

    if (searchTables.includes('work_logs')) {
      const workLogs = await this.prisma.workLog.findMany({
        where: {
          OR: [
            { start_location: { contains: q, mode: 'insensitive' } },
            { end_location: { contains: q, mode: 'insensitive' } },
            { remarks: { contains: q, mode: 'insensitive' } },
            { equipment_number: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, scheduled_date: true, equipment_number: true, start_location: true, end_location: true, status: true },
        orderBy: { scheduled_date: 'desc' },
        take: 5,
      });
      if (workLogs.length > 0) results.work_logs = workLogs;
    }

    if (searchTables.includes('invoices')) {
      const invoices = await this.prisma.invoice.findMany({
        where: { invoice_no: { contains: q, mode: 'insensitive' } },
        select: { invoice_no: true, date: true, total_amount: true, status: true },
        take: 5,
      });
      if (invoices.length > 0) results.invoices = invoices;
    }

    if (searchTables.includes('quotations')) {
      const quotations = await this.prisma.quotation.findMany({
        where: {
          OR: [
            { quotation_no: { contains: q, mode: 'insensitive' } },
            { contract_name: { contains: q, mode: 'insensitive' } },
            { project_name: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { quotation_no: true, quotation_date: true, contract_name: true, total_amount: true, status: true },
        take: 5,
      });
      if (quotations.length > 0) results.quotations = quotations;
    }

    const totalFound = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
    return {
      query,
      total_found: totalFound,
      results,
      summary: totalFound > 0
        ? `在 ${Object.keys(results).join('、')} 中找到 ${totalFound} 條相關記錄`
        : `未找到與「${query}」相關的資料`,
    };
  }
}
