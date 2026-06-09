import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayrollCalculationService } from '../payroll/payroll-calculation.service';
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
type AiPayrollSessionRow = Prisma.AiPayrollSessionGetPayload<Record<string, never>>;

interface ResolvedCompanyInfo {
  companyId: number | null;
  companyName: string | null;
}

interface ReconcileExtraData {
  client_id: number | null;
  client_name: string | null;
  company_id: number | null;
  company_name: string | null;
  company_profile_id: number | null;
  company_profile_name: string | null;
  quotation_id: number | null;
  client_contract_no: string | null;
  product_name: string | null;
  product_unit: string | null;
}

@Injectable()
export class AiPayrollGenerateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payrollService: PayrollService,
    private readonly calcService: PayrollCalculationService,
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

    const groupedItems = this.groupItemsByEmployee(items);
    const payrollIds: number[] = [];
    const results: PayrollResult[] = [];

    for (const [employeeId, employeeItems] of groupedItems) {
      const payroll = (await this.createPayrollFromReconcileItems(
        session,
        employeeId,
        employeeItems,
        userId,
      )) as PayrollResult;

      let finalPayroll = payroll;
      if (dto.confirm) {
        finalPayroll = (await this.payrollService.finalizePreparation(
          payroll.id,
          userId,
        )) as PayrollResult;
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

  private groupItemsByEmployee(items: ReconcileItemRow[]) {
    const grouped = new Map<number, ReconcileItemRow[]>();
    for (const item of items) {
      const employeeItems = grouped.get(item.reconcile_employee_id) ?? [];
      employeeItems.push(item);
      grouped.set(item.reconcile_employee_id, employeeItems);
    }
    return grouped;
  }

  private async createPayrollFromReconcileItems(
    session: AiPayrollSessionRow,
    employeeId: number,
    items: ReconcileItemRow[],
    userId: number,
  ) {
    const dateFrom = this.toDateString(session.session_date_from);
    const dateTo = this.toDateString(session.session_date_to);

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const existingPayroll = await this.prisma.payroll.findFirst({
      where: {
        employee_id: employeeId,
        date_from: new Date(dateFrom),
        date_to: new Date(dateTo),
        company_id: session.session_company_id,
      },
    });

    if (
      existingPayroll &&
      (existingPayroll.status !== 'preparing' ||
        existingPayroll.payroll_ai_session_id !== session.id)
    ) {
      throw new BadRequestException(
        `此員工在 ${dateFrom} 至 ${dateTo} 的糧單已存在（ID: ${existingPayroll.id}）`,
      );
    }

    const companyInfo = await this.resolveCompanyInfo(session.session_company_id);
    const payroll = existingPayroll
      ? await this.resetExistingAiPreparingPayroll(existingPayroll.id, companyInfo, session, userId)
      : await this.prisma.payroll.create({
          data: {
            period: session.session_period,
            date_from: new Date(dateFrom),
            date_to: new Date(dateTo),
            employee_id: employee.id,
            company_id: companyInfo.companyId ?? undefined,
            salary_type: 'daily',
            base_rate: 0,
            work_days: 0,
            work_nights: 0,
            base_amount: 0,
            allowance_total: 0,
            ot_total: 0,
            commission_total: 0,
            mpf_deduction: 0,
            adjustment_total: 0,
            net_amount: 0,
            status: 'preparing',
            payroll_ai_session_id: session.id,
            payroll_ai_generated: true,
            payroll_created_by: userId || undefined,
          },
        });

    const workLogLikeRecords = await this.buildPayrollWorkLogSourceRecords(
      payroll.id,
      session,
      items,
      companyInfo,
    );
    const enrichedRecords = await this.calcService.enrichWorkLogsWithPrice(workLogLikeRecords);

    for (const record of enrichedRecords) {
      const baseAmount = Number(record._line_amount) || 0;
      const otAmount = Number(record._ot_line_amount) || 0;
      const midShiftAmount = Number(record._mid_shift_line_amount) || 0;
      const totalLineAmount = baseAmount + otAmount + midShiftAmount;

      await this.prisma.payrollWorkLog.create({
        data: {
          payroll_id: payroll.id,
          work_log_id: null,
          service_type: record.service_type,
          scheduled_date: record.scheduled_date,
          day_night: record.day_night,
          start_location: record.start_location,
          end_location: record.end_location,
          machine_type: record.machine_type,
          tonnage: record.tonnage,
          equipment_number: record.equipment_number,
          quantity: this.decimalOrNull(record.quantity),
          unit: record.unit,
          ot_quantity: this.decimalOrNull(record.ot_quantity),
          ot_unit: record.ot_unit,
          is_mid_shift: record.is_mid_shift || false,
          remarks: record.remarks,
          matched_rate_card_id:
            record._matched_rate_card_id ?? record.matched_rate_card_id ?? null,
          matched_rate: this.decimalOrNull(record._matched_rate ?? record.matched_rate),
          matched_unit: record._matched_unit ?? record.matched_unit ?? null,
          matched_ot_rate: this.decimalOrNull(
            record._matched_ot_rate ?? record.matched_ot_rate,
          ),
          matched_mid_shift_rate: this.decimalOrNull(
            record._matched_mid_shift_rate ?? record.matched_mid_shift_rate,
          ),
          price_match_status:
            record._price_match_status ?? record.price_match_status ?? null,
          price_match_note: record._price_match_note ?? record.price_match_note ?? null,
          line_amount: new Prisma.Decimal(totalLineAmount),
          ot_line_amount: new Prisma.Decimal(otAmount),
          mid_shift_line_amount: new Prisma.Decimal(midShiftAmount),
          group_key: record._group_key ?? '',
          client_id: record.client_id ?? null,
          client_name: record.client?.name ?? record.client_name ?? null,
          company_profile_id: record.company_profile_id ?? null,
          company_profile_name:
            record.company_profile?.chinese_name ?? record.company_profile_name ?? null,
          company_id: record.company_id ?? null,
          company_name: record.company?.name ?? record.company_name ?? null,
          quotation_id: record.quotation_id ?? null,
          client_contract_no:
            record.quotation?.quotation_no ?? record.client_contract_no ?? null,
          payroll_work_log_product_name: record.work_log_product_name ?? null,
          payroll_work_log_product_unit: record.work_log_product_unit ?? null,
          is_modified: false,
          is_excluded: false,
        },
      });
    }

    return this.payrollService.findOne(payroll.id);
  }

  private async resetExistingAiPreparingPayroll(
    payrollId: number,
    companyInfo: ResolvedCompanyInfo,
    session: AiPayrollSessionRow,
    userId: number,
  ) {
    await this.prisma.payrollWorkLog.deleteMany({ where: { payroll_id: payrollId } });
    await this.prisma.payrollItem.deleteMany({ where: { payroll_id: payrollId } });
    await this.prisma.payrollDailyAllowance.deleteMany({ where: { payroll_id: payrollId } });
    return this.prisma.payroll.update({
      where: { id: payrollId },
      data: {
        period: session.session_period,
        date_from: session.session_date_from,
        date_to: session.session_date_to,
        company_id: companyInfo.companyId ?? undefined,
        company_profile_id: null,
        salary_type: 'daily',
        base_rate: 0,
        work_days: 0,
        work_nights: 0,
        base_amount: 0,
        allowance_total: 0,
        ot_total: 0,
        commission_total: 0,
        mpf_deduction: 0,
        mpf_employer: 0,
        mpf_relevant_income: null,
        adjustment_total: 0,
        net_amount: 0,
        status: 'preparing',
        payroll_ai_session_id: session.id,
        payroll_ai_generated: true,
        payroll_created_by: userId || undefined,
      },
    });
  }

  private async buildPayrollWorkLogSourceRecords(
    payrollId: number,
    session: AiPayrollSessionRow,
    items: ReconcileItemRow[],
    companyInfo: ResolvedCompanyInfo,
  ) {
    const records = [] as any[];
    for (const item of items) {
      const data = this.asSourceData(item.reconcile_decided_data);
      if (data.service_type === '請假/休息') continue;

      const extra = this.asExtraData(item.reconcile_decided_data);
      const client = await this.resolveClient(
        extra.client_id,
        extra.client_name ?? data.client_name ?? null,
      );
      const companyProfile = await this.resolveCompanyProfile(extra.company_profile_id);
      const companyId = extra.company_id ?? companyInfo.companyId;
      const scheduledDate = data.date ? new Date(data.date) : item.reconcile_date;
      const clientContractNo = extra.client_contract_no ?? data.contract_no ?? null;

      records.push({
        id: `ai-reconcile-${item.id}`,
        payroll_id: payrollId,
        scheduled_date: scheduledDate,
        service_type: data.service_type ?? data.work_type_decided ?? item.reconcile_work_type ?? 'AI 計糧',
        day_night: data.day_night,
        start_location: data.start_location,
        start_time: data.start_time,
        end_location: data.end_location,
        end_time: data.end_time,
        machine_type: data.machine_type,
        tonnage: data.tonnage,
        equipment_number: data.equipment_number,
        quantity: data.quantity,
        unit: data.unit,
        ot_quantity:
          item.reconcile_ot_hours !== null && item.reconcile_ot_hours !== undefined
            ? Number(item.reconcile_ot_hours)
            : data.ot_quantity,
        ot_unit: data.ot_unit,
        is_mid_shift: data.is_mid_shift ?? false,
        work_content: data.work_content,
        remarks: data.remarks,
        client_id: client?.id ?? extra.client_id ?? null,
        client,
        client_name: client?.name ?? extra.client_name ?? data.client_name ?? null,
        company_profile_id: companyProfile?.id ?? extra.company_profile_id ?? null,
        company_profile: companyProfile,
        company_profile_name:
          companyProfile?.chinese_name ?? extra.company_profile_name ?? null,
        company_id: companyId,
        company: companyInfo.companyId === companyId && companyInfo.companyName
          ? { id: companyInfo.companyId, name: companyInfo.companyName }
          : null,
        company_name: extra.company_name ?? companyInfo.companyName,
        quotation_id: extra.quotation_id,
        quotation: null,
        client_contract_no: clientContractNo,
        work_log_product_name: extra.product_name,
        work_log_product_unit: extra.product_unit,
      });
    }
    return records;
  }

  private async resolveCompanyInfo(companyId: number): Promise<ResolvedCompanyInfo> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    return {
      companyId: company?.id ?? companyId ?? null,
      companyName: company?.name ?? null,
    };
  }

  private async resolveClient(clientId: number | null, clientName: string | null) {
    if (clientId) {
      const client = await this.prisma.partner.findUnique({ where: { id: clientId } });
      if (client) return client;
    }
    if (!clientName) return null;
    return this.prisma.partner.findFirst({
      where: {
        partner_type: 'client',
        OR: [{ name: clientName }, { name_en: clientName }, { code: clientName }],
        deleted_at: null,
      },
    });
  }

  private async resolveCompanyProfile(companyProfileId: number | null) {
    if (!companyProfileId) return null;
    return this.prisma.companyProfile.findUnique({ where: { id: companyProfileId } });
  }

  private async getSession(sessionId: number) {
    const session = await this.prisma.aiPayrollSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('AI 計糧會話不存在');
    return session;
  }

  private asSourceData(value: Prisma.JsonValue): StandardizedSourceRecordData {
    const record = this.asRecord(value);
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
      quantity:
        typeof record.quantity === 'number'
          ? record.quantity
          : this.parseNumber(this.stringOrNull(record.quantity)),
      unit: this.stringOrNull(record.unit),
      start_time: this.stringOrNull(record.start_time),
      end_time: this.stringOrNull(record.end_time),
      ot_quantity:
        typeof record.ot_quantity === 'number'
          ? record.ot_quantity
          : this.parseNumber(this.stringOrNull(record.ot_quantity)),
      ot_unit: this.stringOrNull(record.ot_unit),
      is_mid_shift: typeof record.is_mid_shift === 'boolean' ? record.is_mid_shift : false,
      work_content: this.stringOrNull(record.work_content),
      client_name: this.stringOrNull(record.client_name),
      contract_no: this.stringOrNull(record.contract_no),
      remarks: this.stringOrNull(record.remarks),
      work_type_decided: this.stringOrNull(record.work_type_decided),
    };
  }

  private asExtraData(value: Prisma.JsonValue): ReconcileExtraData {
    const record = this.asRecord(value);
    return {
      client_id: this.intOrNull(record.client_id),
      client_name: this.stringOrNull(record.client_name),
      company_id: this.intOrNull(record.company_id),
      company_name: this.stringOrNull(record.company_name),
      company_profile_id: this.intOrNull(record.company_profile_id),
      company_profile_name:
        this.stringOrNull(record.company_profile_name) ??
        this.stringOrNull(record.company_chinese_name),
      quotation_id: this.intOrNull(record.quotation_id),
      client_contract_no:
        this.stringOrNull(record.client_contract_no) ?? this.stringOrNull(record.contract_no),
      product_name:
        this.stringOrNull(record.work_log_product_name) ??
        this.stringOrNull(record.product_name),
      product_unit:
        this.stringOrNull(record.work_log_product_unit) ??
        this.stringOrNull(record.product_unit),
    };
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private intOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private decimalOrNull(value: unknown): Prisma.Decimal | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : this.parseNumber(String(value));
    return parsed !== null ? new Prisma.Decimal(parsed) : null;
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
