import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayrollService } from '../payroll/payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratePayrollDto } from './dto/generate-payroll.dto';
import { PreviewPayrollDto } from './dto/query-session-data.dto';
import { StandardizedSourceRecordData } from './interfaces/source-record.interface';

export interface PayrollResult {
  id: number;
  status?: string;
  net_amount?: Prisma.Decimal | number | null;
}

export interface PayrollPreviewItem {
  employee_id: number;
  employee_name: string | null;
  item_count: number;
  work_days: number;
  has_unresolved_questions: boolean;
  statuses: Record<string, number>;
  estimated_records: StandardizedSourceRecordData[];
}

type ReconcileItemRow = Prisma.AiPayrollReconcileItemGetPayload<Record<string, never>>;

@Injectable()
export class AiPayrollGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollService: PayrollService,
  ) {}

  async preview(sessionId: number, query: PreviewPayrollDto) {
    const session = await this.getSession(sessionId);
    const where: Prisma.AiPayrollReconcileItemWhereInput = {
      reconcile_session_id: sessionId,
      ...(query.employee_id ? { reconcile_employee_id: query.employee_id } : {}),
    };
    const [items, unresolvedQuestions] = await Promise.all([
      this.prisma.aiPayrollReconcileItem.findMany({
        where,
        orderBy: [{ reconcile_employee_id: 'asc' }, { reconcile_date: 'asc' }],
      }),
      this.prisma.aiPayrollQuestion.findMany({
        where: { question_session_id: sessionId, question_resolved: false },
      }),
    ]);

    const questionEmployeeIds = new Set(
      unresolvedQuestions
        .map((question) => question.question_employee_id)
        .filter((employeeId): employeeId is number => employeeId !== null),
    );
    const grouped = new Map<number, PayrollPreviewItem>();
    for (const item of items) {
      const data = this.asSourceData(item.reconcile_decided_data);
      const current = grouped.get(item.reconcile_employee_id) ?? {
        employee_id: item.reconcile_employee_id,
        employee_name: data.employee_name ?? null,
        item_count: 0,
        work_days: 0,
        has_unresolved_questions: questionEmployeeIds.has(item.reconcile_employee_id),
        statuses: {},
        estimated_records: [],
      };
      current.item_count += 1;
      current.work_days += data.service_type === '請假/休息' ? 0 : 1;
      current.statuses[item.reconcile_status] =
        (current.statuses[item.reconcile_status] ?? 0) + 1;
      current.estimated_records.push(data);
      grouped.set(item.reconcile_employee_id, current);
    }

    return {
      session_id: session.id,
      period: session.session_period,
      date_from: this.toDateString(session.session_date_from),
      date_to: this.toDateString(session.session_date_to),
      employees: [...grouped.values()],
    };
  }

  async generate(sessionId: number, dto: GeneratePayrollDto, userId: number) {
    const session = await this.getSession(sessionId);
    const unresolved = await this.prisma.aiPayrollQuestion.count({
      where: { question_session_id: sessionId, question_resolved: false },
    });
    if (unresolved > 0) {
      throw new BadRequestException('仍有未處理問題，請先回答或忽略後再生成糧單');
    }

    const items = await this.prisma.aiPayrollReconcileItem.findMany({
      where: {
        reconcile_session_id: sessionId,
        reconcile_status: { in: ['matched', 'confirmed', 'conflict'] },
      },
      orderBy: [{ reconcile_employee_id: 'asc' }, { reconcile_date: 'asc' }],
    });
    if (items.length === 0) throw new BadRequestException('沒有可生成糧單的核對項目');

    await this.ensureAiWorkLogs(sessionId, session.session_company_id, items, userId);

    const employeeIds = [...new Set(items.map((item) => item.reconcile_employee_id))];
    const payrollIds: number[] = [];
    const results: PayrollResult[] = [];

    for (const employeeId of employeeIds) {
      const payroll = (await this.payrollService.prepare(
        {
          employee_id: employeeId,
          date_from: this.toDateString(session.session_date_from),
          date_to: this.toDateString(session.session_date_to),
          company_id: session.session_company_id,
          period: session.session_period,
        },
        userId,
      )) as PayrollResult;

      await this.prisma.payroll.update({
        where: { id: payroll.id },
        data: {
          payroll_ai_session_id: sessionId,
          payroll_ai_generated: true,
        },
      });

      let finalPayroll = payroll;
      if (dto.confirm) {
        finalPayroll = (await this.payrollService.finalizePreparation(
          payroll.id,
          userId,
        )) as PayrollResult;
        await this.prisma.payroll.update({
          where: { id: payroll.id },
          data: {
            payroll_ai_session_id: sessionId,
            payroll_ai_generated: true,
          },
        });
      }
      payrollIds.push(payroll.id);
      results.push(finalPayroll);
    }

    await this.prisma.aiPayrollSession.update({
      where: { id: sessionId },
      data: {
        session_status: dto.confirm ? 'confirmed' : 'completed',
        session_current_step: 5,
        session_payroll_ids: payrollIds as Prisma.InputJsonValue,
      },
    });

    return {
      payroll_ids: payrollIds,
      payrolls: results,
      confirmed: dto.confirm ?? false,
    };
  }

  private async ensureAiWorkLogs(
    sessionId: number,
    companyId: number,
    items: ReconcileItemRow[],
    userId: number,
  ) {
    for (const item of items) {
      if (item.reconcile_work_log_id) continue;
      const data = this.asSourceData(item.reconcile_decided_data);
      const created = await this.prisma.workLog.create({
        data: {
          publisher_id: userId || null,
          status: 'completed',
          service_type: data.service_type ?? data.work_type_decided ?? 'AI 計糧',
          scheduled_date: item.reconcile_date,
          company_id: companyId,
          employee_id: item.reconcile_employee_id,
          machine_type: data.machine_type,
          equipment_number: data.equipment_number,
          tonnage: data.tonnage,
          day_night: data.day_night,
          start_location: data.start_location,
          start_time: data.start_time,
          end_location: data.end_location,
          end_time: data.end_time,
          quantity:
            data.quantity !== null && data.quantity !== undefined
              ? new Prisma.Decimal(data.quantity)
              : null,
          unit: data.unit,
          ot_quantity:
            item.reconcile_ot_hours !== null && item.reconcile_ot_hours !== undefined
              ? item.reconcile_ot_hours
              : data.ot_quantity !== null && data.ot_quantity !== undefined
                ? new Prisma.Decimal(data.ot_quantity)
                : null,
          ot_unit: data.ot_unit,
          is_mid_shift: data.is_mid_shift ?? false,
          source: 'ai_payroll',
          ai_parsed_data: {
            session_id: sessionId,
            reconcile_item_id: item.id,
            decided_data: data,
          } as unknown as Prisma.InputJsonValue,
          work_content: data.work_content,
          remarks: data.remarks ?? `AI 計糧會話 #${sessionId} 生成`,
        },
      });
      await this.prisma.aiPayrollReconcileItem.update({
        where: { id: item.id },
        data: { reconcile_work_log_id: created.id },
      });
    }
  }

  private async getSession(sessionId: number) {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return session;
  }

  private asSourceData(value: Prisma.JsonValue): StandardizedSourceRecordData {
    const object = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
    const record = object as Record<string, unknown>;
    return {
      employee_id: Number(record.employee_id ?? 0),
      employee_name: this.stringOrNull(record.employee_name),
      date: String(record.date ?? ''),
      service_type: this.stringOrNull(record.service_type),
      day_night: this.stringOrNull(record.day_night),
      start_location: this.stringOrNull(record.start_location),
      end_location: this.stringOrNull(record.end_location),
      machine_type: this.stringOrNull(record.machine_type),
      tonnage: this.stringOrNull(record.tonnage),
      equipment_number: this.stringOrNull(record.equipment_number),
      quantity: typeof record.quantity === 'number' ? record.quantity : this.parseNumber(this.stringOrNull(record.quantity)),
      unit: this.stringOrNull(record.unit),
      start_time: this.stringOrNull(record.start_time),
      end_time: this.stringOrNull(record.end_time),
      ot_quantity: typeof record.ot_quantity === 'number' ? record.ot_quantity : this.parseNumber(this.stringOrNull(record.ot_quantity)),
      ot_unit: this.stringOrNull(record.ot_unit),
      is_mid_shift: typeof record.is_mid_shift === 'boolean' ? record.is_mid_shift : false,
      work_content: this.stringOrNull(record.work_content),
      client_name: this.stringOrNull(record.client_name),
      contract_no: this.stringOrNull(record.contract_no),
      remarks: this.stringOrNull(record.remarks),
      work_type_decided: this.stringOrNull(record.work_type_decided),
    };
  }

  private parseNumber(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private stringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const stringValue = String(value).trim();
    return stringValue ? stringValue : null;
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
