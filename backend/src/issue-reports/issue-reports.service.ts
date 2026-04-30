import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueReportDto, FrontendErrorItem } from './issue-reports.dto';

@Injectable()
export class IssueReportsService {
  private readonly logger = new Logger(IssueReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateIssueReportDto,
    user: { userId?: number; id?: number; username?: string; displayName?: string; role?: string },
  ) {
    const reporterId = user?.userId ?? user?.id ?? null;
    const reporterName = user?.displayName || user?.username || null;

    // Collect backend errors within ±5 minutes of user's submission
    const now = new Date();
    const from = new Date(now.getTime() - 5 * 60 * 1000);
    const backendLogs = await this.prisma.errorLog.findMany({
      where: {
        error_log_timestamp: { gte: from, lte: now },
        ...(reporterId ? { OR: [{ error_log_user_id: reporterId }, { error_log_user_id: null }] } : {}),
      },
      orderBy: { error_log_timestamp: 'desc' },
      take: 30,
    });

    const backendErrors = backendLogs.map((log) => ({
      timestamp: log.error_log_timestamp,
      method: log.error_log_method,
      path: log.error_log_path,
      status_code: log.error_log_status_code,
      message: log.error_log_message,
      stack: log.error_log_stack,
      user_id: log.error_log_user_id,
      username: log.error_log_username,
    }));

    const record = await this.prisma.issueReport.create({
      data: {
        issue_report_reporter_id: reporterId,
        issue_report_reporter_name: reporterName,
        issue_report_reporter_role: user?.role || null,
        issue_report_description: dto.description,
        issue_report_url: dto.url || null,
        issue_report_user_agent: dto.user_agent || null,
        issue_report_frontend_errors: (dto.frontend_errors as any) || [],
        issue_report_backend_errors: backendErrors as any,
        issue_report_ai_status: 'pending',
      },
    });

    // Trigger AI analysis asynchronously (don't await)
    this.analyzeWithAI(record.id, dto.description, dto.frontend_errors || [], backendErrors, dto.url).catch((e) => {
      this.logger.error(`AI analysis failed for report ${record.id}: ${e.message}`);
    });

    return record;
  }

  async findAll(user: { userId?: number; id?: number; role?: string }, limit = 50) {
    const where: any = {};
    // Non-admin/director only see own reports
    if (user?.role !== 'admin' && user?.role !== 'director') {
      where.issue_report_reporter_id = user?.userId ?? user?.id ?? -1;
    }
    return this.prisma.issueReport.findMany({
      where,
      orderBy: { issue_report_created_at: 'desc' },
      take: limit,
    });
  }

  async findOne(id: number, user: { userId?: number; id?: number; role?: string }) {
    const report = await this.prisma.issueReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('問題回報不存在');
    const uid = user?.userId ?? user?.id;
    if (user?.role !== 'admin' && user?.role !== 'director' && report.issue_report_reporter_id !== uid) {
      throw new NotFoundException('問題回報不存在');
    }
    return report;
  }

  async updateStatus(id: number, status: 'open' | 'acknowledged' | 'resolved') {
    return this.prisma.issueReport.update({
      where: { id },
      data: { issue_report_status: status },
    });
  }

  private async analyzeWithAI(
    reportId: number,
    description: string,
    frontendErrors: FrontendErrorItem[],
    backendErrors: any[],
    url?: string,
  ): Promise<void> {
    try {
      await this.prisma.issueReport.update({
        where: { id: reportId },
        data: { issue_report_ai_status: 'analyzing' },
      });

      if (!process.env.OPENAI_API_KEY) {
        await this.prisma.issueReport.update({
          where: { id: reportId },
          data: {
            issue_report_ai_status: 'failed',
            issue_report_ai_error: 'OPENAI_API_KEY 未設定',
          },
        });
        return;
      }

      // Lazy import to avoid requiring openai at startup
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI();

      const systemPrompt = `你是明達 ERP 系統的技術支援助手。請根據用戶的問題描述、前端錯誤記錄和後端錯誤記錄，分析問題可能原因並提供建議。請用繁體中文回覆，輸出格式：

## 問題摘要
（1-2 句話總結用戶遇到的問題）

## 可能原因
（列出 1-3 個可能的技術原因）

## 建議處理方向
（給開發團隊的具體建議）

## 對用戶的回覆
（以禮貌口吻告訴用戶下一步可以怎麼做，例如「已記錄此問題，工程團隊將盡快跟進」或請用戶嘗試的操作）`;

      const userPrompt = `# 用戶問題描述
${description}

# 用戶所在頁面
${url || '未知'}

# 前端錯誤記錄 (最近 5 分鐘, 共 ${frontendErrors.length} 筆)
${frontendErrors.length === 0 ? '（無）' : JSON.stringify(frontendErrors.slice(0, 15), null, 2)}

# 後端錯誤記錄 (最近 5 分鐘, 共 ${backendErrors.length} 筆)
${backendErrors.length === 0 ? '（無）' : JSON.stringify(backendErrors.slice(0, 15), null, 2)}

請進行綜合分析。`;

      const completion = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
      });

      const analysis = completion.choices?.[0]?.message?.content || '（AI 未回傳分析）';

      await this.prisma.issueReport.update({
        where: { id: reportId },
        data: {
          issue_report_ai_status: 'completed',
          issue_report_ai_analysis: analysis,
        },
      });
    } catch (e: any) {
      this.logger.error(`AI analysis error for ${reportId}: ${e?.message}`);
      await this.prisma.issueReport.update({
        where: { id: reportId },
        data: {
          issue_report_ai_status: 'failed',
          issue_report_ai_error: e?.message || 'AI 分析失敗',
        },
      });
    }
  }
}
