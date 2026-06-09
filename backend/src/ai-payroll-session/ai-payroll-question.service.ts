import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiKnowledgeService } from '../ai-knowledge/ai-knowledge.service';
import { AnswerQuestionDto, BatchDismissQuestionsDto, QueryQuestionsDto } from './dto/answer-question.dto';
import { ReconcileQuestionDraft } from './interfaces/reconcile-result.interface';

@Injectable()
export class AiPayrollQuestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: AiKnowledgeService,
  ) {}

  async listQuestions(sessionId: number, query: QueryQuestionsDto) {
    await this.ensureSession(sessionId);
    return this.prisma.aiPayrollQuestion.findMany({
      where: {
        question_session_id: sessionId,
        ...(query.resolved !== undefined
          ? { question_resolved: query.resolved }
          : {}),
        ...(query.type ? { question_type: query.type } : {}),
        ...(query.employee_id ? { question_employee_id: query.employee_id } : {}),
      },
      include: {
        knowledge_entry: true,
      },
      orderBy: [
        { question_resolved: 'asc' },
        { question_severity: 'desc' },
        { question_created_at: 'desc' },
      ],
    });
  }

  async createQuestions(sessionId: number, questions: ReconcileQuestionDraft[]) {
    if (questions.length === 0) return { count: 0 };
    await this.ensureSession(sessionId);
    await this.prisma.aiPayrollQuestion.createMany({
      data: questions.map((question) => ({
        question_session_id: sessionId,
        question_employee_id: question.employeeId ?? null,
        question_date: question.date ? new Date(question.date) : null,
        question_type: question.type,
        question_severity: question.severity,
        question_text: question.text,
        question_context: this.toJson(question.context),
        question_ai_decision: question.aiDecision ?? null,
        question_ai_action: this.toJson(question.aiAction),
      })),
    });
    return { count: questions.length };
  }

  async answerQuestion(
    sessionId: number,
    questionId: number,
    dto: AnswerQuestionDto,
    userId: number,
  ) {
    const question = await this.prisma.aiPayrollQuestion.findFirst({
      where: { id: questionId, question_session_id: sessionId },
    });
    if (!question) throw new NotFoundException('問題不存在');

    const knowledgeEntry = await this.knowledgeService.create(
      {
        moduleScope: 'module',
        moduleCode: 'ai-payroll-session',
        category: 'payroll_hint',
        title: `AI 計糧問題回覆：${question.question_type}`.slice(0, 255),
        description: dto.answer,
        payload: {
          questionId,
          sessionId,
          questionType: question.question_type,
          questionText: question.question_text,
          userAnswer: dto.answer,
          aiDecision: question.question_ai_decision,
          context: question.question_context,
        },
        appliesToEntityType: question.question_employee_id ? 'employee' : undefined,
        appliesToEntityId: question.question_employee_id ?? undefined,
        keywords: [
          'ai-payroll-session',
          question.question_type,
          question.question_employee_id
            ? `employee:${question.question_employee_id}`
            : 'session',
        ],
        confidenceScore: 80,
        status: 'approved',
        createdByType: 'manual',
        evidence: [
          {
            sourceModuleCode: 'ai-payroll-session',
            sourceEntityType: 'ai_payroll_question',
            sourceEntityId: questionId,
            beforeValue: question.question_ai_decision ?? undefined,
            afterValue: dto.answer,
            summary: '用戶回答 AI 計糧問題後寫入知識庫',
            weight: 1,
          },
        ],
      },
      userId,
    );

    const updated = await this.prisma.aiPayrollQuestion.update({
      where: { id: questionId },
      data: {
        question_user_answer: dto.answer,
        question_resolved: true,
        question_resolved_at: new Date(),
        question_knowledge_entry_id: knowledgeEntry.id,
      },
      include: { knowledge_entry: true },
    });

    await this.updateSessionReviewStatus(sessionId);
    return updated;
  }

  async batchDismiss(sessionId: number, dto: BatchDismissQuestionsDto) {
    await this.ensureSession(sessionId);
    const result = await this.prisma.aiPayrollQuestion.updateMany({
      where: {
        question_session_id: sessionId,
        id: { in: dto.question_ids },
      },
      data: {
        question_resolved: true,
        question_resolved_at: new Date(),
        question_user_answer: 'dismissed',
      },
    });
    await this.updateSessionReviewStatus(sessionId);
    return { updated: result.count };
  }

  private async ensureSession(sessionId: number) {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return session;
  }

  private async updateSessionReviewStatus(sessionId: number) {
    const unresolved = await this.prisma.aiPayrollQuestion.count({
      where: { question_session_id: sessionId, question_resolved: false },
    });
    if (unresolved === 0) {
      await this.prisma.aiPayrollSession.update({
        where: { id: sessionId },
        data: { session_status: 'completed' },
      });
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    return value as Prisma.InputJsonValue;
  }
}
