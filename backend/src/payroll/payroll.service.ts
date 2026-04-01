import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { PayrollWorkLog } from './payroll-work-log.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';
import { Employee } from '../employees/employee.entity';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { WorkLog } from '../work-logs/work-log.entity';
import { FleetRateCard } from '../fleet-rate-cards/fleet-rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';
import { RateCard } from '../rate-cards/rate-card.entity';
import { Partner } from '../partners/partner.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private payrollItemRepo: Repository<PayrollItem>,
    @InjectRepository(PayrollWorkLog)
    private payrollWorkLogRepo: Repository<PayrollWorkLog>,
    @InjectRepository(PayrollAdjustment)
    private payrollAdjustmentRepo: Repository<PayrollAdjustment>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(EmployeeSalarySetting)
    private salarySettingRepo: Repository<EmployeeSalarySetting>,
    @InjectRepository(WorkLog)
    private workLogRepo: Repository<WorkLog>,
    @InjectRepository(FleetRateCard)
    private fleetRateCardRepo: Repository<FleetRateCard>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepo: Repository<CompanyProfile>,
    @InjectRepository(RateCard)
    private rateCardRepo: Repository<RateCard>,
    @InjectRepository(Partner)
    private partnerRepo: Repository<Partner>,
  ) {}

  // ── 列表 ──────────────────────────────────────────────────────
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const qb = this.payrollRepo.createQueryBuilder('p')
      .leftJoinAndSelect('p.employee', 'employee')
      .leftJoinAndSelect('employee.company', 'company')
      .leftJoinAndSelect('p.company_profile', 'company_profile');

    if (query.period) {
      qb.andWhere('p.period = :period', { period: query.period });
    }
    if (query.company_profile_id) {
      qb.andWhere('p.company_profile_id = :cpId', { cpId: Number(query.company_profile_id) });
    }
    if (query.employee_id) {
      qb.andWhere('p.employee_id = :empId', { empId: Number(query.employee_id) });
    }
    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere('(employee.name_zh ILIKE :s OR employee.name_en ILIKE :s OR employee.emp_code ILIKE :s)', { s: `%${query.search}%` });
    }

    const sortBy = query.sortBy || 'id';
    const sortOrder = (query.sortOrder || 'DESC').toUpperCase() as 'ASC' | 'DESC';
    const allowedSort = ['id', 'period', 'net_amount', 'status', 'created_at'];
    if (allowedSort.includes(sortBy)) {
      qb.orderBy(`p.${sortBy}`, sortOrder);
    } else {
      qb.orderBy('p.id', 'DESC');
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  // ── 詳情（含工作記錄和調整項）──────────────────────────────
  async findOne(id: number) {
    const payroll = await this.payrollRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.company', 'company_profile', 'items', 'adjustments'],
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.items) {
      payroll.items.sort((a, b) => a.sort_order - b.sort_order);
    }
    if (payroll.adjustments) {
      payroll.adjustments.sort((a, b) => a.sort_order - b.sort_order);
    }

    // Load payroll work logs
    let pwls = await this.payrollWorkLogRepo.find({
      where: { payroll_id: id },
      order: { scheduled_date: 'ASC', id: 'ASC' },
    });

    // ── 自動回填：如果 payroll_work_logs 為空（舊糧單），從 work_logs 表查詢並回填 ──
    if (pwls.length === 0 && payroll.date_from && payroll.date_to && payroll.employee_id) {
      pwls = await this.backfillPayrollWorkLogs(payroll);
    }

    // Build grouped settlement
    const grouped = this.buildGroupedSettlement(pwls.filter(p => !p.is_excluded));

    return {
      ...payroll,
      payroll_work_logs: pwls,
      grouped_settlement: grouped,
    };
  }

  /**
   * 自動回填 payroll_work_logs（針對舊糧單，從 work_logs 表查詢對應工作記錄並保存副本）
   */
  private async backfillPayrollWorkLogs(payroll: Payroll): Promise<PayrollWorkLog[]> {
    try {
      const wlQb = this.workLogRepo.createQueryBuilder('wl')
        .leftJoinAndSelect('wl.company_profile', 'company_profile')
        .leftJoinAndSelect('wl.client', 'client')
        .leftJoinAndSelect('wl.quotation', 'quotation')
        .where('wl.employee_id = :empId', { empId: payroll.employee_id })
        .andWhere('wl.scheduled_date >= :start', { start: payroll.date_from })
        .andWhere('wl.scheduled_date <= :end', { end: payroll.date_to })
        .andWhere("wl.service_type != '請假/休息'")
        .orderBy('wl.scheduled_date', 'ASC');

      if (payroll.company_profile_id) {
        wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: payroll.company_profile_id });
      }

      const workLogs = await wlQb.getMany();
      if (workLogs.length === 0) return [];

      // Enrich with price info
      const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);

      // Save as payroll_work_logs
      const savedPwls: PayrollWorkLog[] = [];
      for (const wl of enrichedWorkLogs) {
        const pwl = this.payrollWorkLogRepo.create({
          payroll_id: payroll.id,
          work_log_id: wl.id,
          service_type: wl.service_type,
          scheduled_date: wl.scheduled_date,
          day_night: wl.day_night,
          start_location: wl.start_location,
          end_location: wl.end_location,
          machine_type: wl.machine_type,
          tonnage: wl.tonnage,
          equipment_number: wl.equipment_number,
          quantity: wl.quantity,
          unit: wl.unit,
          ot_quantity: wl.ot_quantity,
          ot_unit: wl.ot_unit,
          remarks: wl.remarks,
          matched_rate_card_id: (wl as any)._matched_rate_card_id ?? wl.matched_rate_card_id,
          matched_rate: (wl as any)._matched_rate ?? wl.matched_rate,
          matched_unit: (wl as any)._matched_unit ?? wl.matched_unit,
          matched_ot_rate: (wl as any)._matched_ot_rate ?? wl.matched_ot_rate,
          price_match_status: (wl as any)._price_match_status ?? wl.price_match_status,
          price_match_note: (wl as any)._price_match_note ?? wl.price_match_note,
          line_amount: (wl as any)._line_amount ?? 0,
          group_key: (wl as any)._group_key ?? '',
          client_id: wl.client_id,
          client_name: wl.client?.name ?? (wl as any).client_name ?? null,
          company_profile_id: wl.company_profile_id,
          company_profile_name: wl.company_profile?.chinese_name ?? (wl as any).company_profile_name ?? null,
          quotation_id: wl.quotation_id,
          contract_no: wl.quotation?.quotation_number ?? (wl as any).contract_no ?? null,
          is_modified: false,
          is_excluded: false,
        });
        const saved = await this.payrollWorkLogRepo.save(pwl);
        savedPwls.push(saved);
      }

      return savedPwls;
    } catch (err) {
      console.error('Failed to backfill payroll work logs:', err);
      return [];
    }
  }

  // ── 預覽計糧（不儲存，返回計算結果、工作記錄明細、歸組結算）──
  async preview(body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
  }) {
    const { employee_id, date_from, date_to, company_profile_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to) throw new BadRequestException('開始日期不能晚於結束日期');

    const emp = await this.employeeRepo.findOne({
      where: { id: employee_id },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Get salary setting
    const salarySetting = await this.salarySettingRepo.createQueryBuilder('ss')
      .where('ss.employee_id = :empId', { empId: emp.id })
      .andWhere('ss.effective_date <= :end', { end: date_to })
      .orderBy('ss.effective_date', 'DESC')
      .getOne();

    // Get work logs
    const wlQb = this.workLogRepo.createQueryBuilder('wl')
      .leftJoinAndSelect('wl.company_profile', 'company_profile')
      .leftJoinAndSelect('wl.client', 'client')
      .leftJoinAndSelect('wl.quotation', 'quotation')
      .where('wl.employee_id = :empId', { empId: emp.id })
      .andWhere('wl.scheduled_date >= :start', { start: date_from })
      .andWhere('wl.scheduled_date <= :end', { end: date_to })
      .andWhere("wl.service_type != '請假/休息'")
      .orderBy('wl.scheduled_date', 'ASC');

    if (company_profile_id) {
      wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
    }

    const workLogs = await wlQb.getMany();

    // Enrich work logs with price info from rate cards
    const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);

    // Build grouped settlement for preview
    const grouped = this.buildGroupedSettlementFromWorkLogs(enrichedWorkLogs);

    // Calculate preview
    const calculation = salarySetting
      ? await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null)
      : null;

    return {
      employee: emp,
      salary_setting: salarySetting,
      work_logs: enrichedWorkLogs,
      grouped_settlement: grouped,
      calculation,
      date_from,
      date_to,
    };
  }

  // ── 生成計糧（單一員工，日期範圍）────────────────────────────
  async generate(body: {
    employee_id: number;
    date_from: string;
    date_to: string;
    company_profile_id?: number;
    period?: string;
  }) {
    const { employee_id, date_from, date_to, company_profile_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to) throw new BadRequestException('開始日期不能晚於結束日期');

    const period = body.period || date_from.substring(0, 7);

    const emp = await this.employeeRepo.findOne({
      where: { id: employee_id },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Check for existing payroll
    const existingQb = this.payrollRepo.createQueryBuilder('p')
      .where('p.employee_id = :empId', { empId: emp.id })
      .andWhere('p.date_from = :dateFrom', { dateFrom: date_from })
      .andWhere('p.date_to = :dateTo', { dateTo: date_to });

    if (company_profile_id) {
      existingQb.andWhere('p.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
    }

    const existing = await existingQb.getOne();
    if (existing) {
      throw new BadRequestException(`此員工在 ${date_from} 至 ${date_to} 的糧單已存在（ID: ${existing.id}）`);
    }

    const salarySetting = await this.salarySettingRepo.createQueryBuilder('ss')
      .where('ss.employee_id = :empId', { empId: emp.id })
      .andWhere('ss.effective_date <= :end', { end: date_to })
      .orderBy('ss.effective_date', 'DESC')
      .getOne();

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法生成糧單');
    }

    const wlQb = this.workLogRepo.createQueryBuilder('wl')
      .leftJoinAndSelect('wl.company_profile', 'company_profile')
      .leftJoinAndSelect('wl.client', 'client')
      .leftJoinAndSelect('wl.quotation', 'quotation')
      .where('wl.employee_id = :empId', { empId: emp.id })
      .andWhere('wl.scheduled_date >= :start', { start: date_from })
      .andWhere('wl.scheduled_date <= :end', { end: date_to })
      .andWhere("wl.service_type != '請假/休息'");

    if (company_profile_id) {
      wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
    }

    const workLogs = await wlQb.getMany();

    const calc = await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null);

    let actualCpId = company_profile_id ?? null;
    if (!actualCpId && workLogs.length > 0) {
      actualCpId = workLogs[0].company_profile_id;
    }

    // Create payroll record
    const payroll = this.payrollRepo.create({
      period,
      date_from,
      date_to,
      employee_id: emp.id,
      company_profile_id: actualCpId ?? undefined,
      salary_type: calc.salary_type,
      base_rate: calc.base_rate,
      work_days: calc.work_days,
      base_amount: calc.base_amount,
      allowance_total: calc.allowance_total,
      ot_total: calc.ot_total,
      commission_total: calc.commission_total,
      mpf_deduction: calc.mpf_deduction,
      mpf_plan: calc.mpf_plan,
      mpf_employer: calc.mpf_employer,
      adjustment_total: 0,
      net_amount: calc.net_amount,
      status: 'draft',
    });

    const saved = await this.payrollRepo.save(payroll) as Payroll;

    // Save payroll items
    for (const item of calc.items) {
      const payrollItem = this.payrollItemRepo.create({
        ...item,
        payroll_id: saved.id,
      });
      await this.payrollItemRepo.save(payrollItem);
    }

    // Save payroll work logs with price info
    const enrichedWorkLogs = await this.enrichWorkLogsWithPrice(workLogs);
    for (const wl of enrichedWorkLogs) {
      const pwl = this.payrollWorkLogRepo.create({
        payroll_id: saved.id,
        work_log_id: wl.id,
        service_type: wl.service_type,
        scheduled_date: wl.scheduled_date,
        day_night: wl.day_night,
        start_location: wl.start_location,
        end_location: wl.end_location,
        machine_type: wl.machine_type,
        tonnage: wl.tonnage,
        equipment_number: wl.equipment_number,
        quantity: wl.quantity,
        unit: wl.unit,
        ot_quantity: wl.ot_quantity,
        ot_unit: wl.ot_unit,
        remarks: wl.remarks,
        matched_rate_card_id: (wl as any)._matched_rate_card_id ?? wl.matched_rate_card_id,
        matched_rate: (wl as any)._matched_rate ?? wl.matched_rate,
        matched_unit: (wl as any)._matched_unit ?? wl.matched_unit,
        matched_ot_rate: (wl as any)._matched_ot_rate ?? wl.matched_ot_rate,
        price_match_status: (wl as any)._price_match_status ?? wl.price_match_status,
        price_match_note: (wl as any)._price_match_note ?? wl.price_match_note,
        line_amount: (wl as any)._line_amount ?? 0,
        group_key: (wl as any)._group_key ?? '',
        client_id: wl.client_id,
        client_name: wl.client?.name ?? (wl as any).client_name ?? null,
        company_profile_id: wl.company_profile_id,
        company_profile_name: wl.company_profile?.chinese_name ?? (wl as any).company_profile_name ?? null,
        quotation_id: wl.quotation_id,
        contract_no: wl.quotation?.quotation_number ?? (wl as any).contract_no ?? null,
        is_modified: false,
        is_excluded: false,
      });
      await this.payrollWorkLogRepo.save(pwl);
    }

    return this.findOne(saved.id);
  }

  // ── 核心計算邏輯（可被 preview 和 generate 共用）────────────
  private async calculatePayroll(
    emp: Employee,
    salarySetting: EmployeeSalarySetting,
    workLogs: WorkLog[],
    dateFrom: string,
    dateTo: string,
    companyProfileId: number | null,
  ) {
    const items: Partial<PayrollItem>[] = [];
    let sortOrder = 1;

    const baseSalary = Number(salarySetting.base_salary) || 0;
    const salaryType = salarySetting.salary_type || 'daily';

    // ── (1) 底薪計算 ──
    let baseAmount = 0;
    let workDays = 0;

    if (salaryType === 'daily') {
      const workDates = new Set(workLogs.map(wl => wl.scheduled_date));
      workDays = workDates.size;
      baseAmount = baseSalary * workDays;

      items.push({
        item_type: 'base_salary',
        item_name: '日薪',
        unit_price: baseSalary,
        quantity: workDays,
        amount: baseAmount,
        sort_order: sortOrder++,
      });
    } else {
      workDays = 1;
      baseAmount = baseSalary;

      items.push({
        item_type: 'base_salary',
        item_name: '月薪',
        unit_price: baseSalary,
        quantity: 1,
        amount: baseAmount,
        sort_order: sortOrder++,
      });
    }

    // ── (2) 津貼計算 ──
    let allowanceTotal = 0;

    const allowanceFields: { field: string; label: string; condition?: (wl: WorkLog) => boolean }[] = [
      { field: 'allowance_night', label: '夜班津貼', condition: (wl) => wl.day_night === '夜' },
      { field: 'allowance_rent', label: '租車津貼' },
      { field: 'allowance_3runway', label: '三跑津貼' },
      { field: 'allowance_well', label: '落井津貼' },
      { field: 'allowance_machine', label: '揸機津貼' },
      { field: 'allowance_roller', label: '火轆津貼' },
      { field: 'allowance_crane', label: '吊/挾車津貼' },
      { field: 'allowance_move_machine', label: '搬機津貼' },
      { field: 'allowance_kwh_night', label: '嘉華-夜間津貼', condition: (wl) => wl.day_night === '夜' },
      { field: 'allowance_mid_shift', label: '中直津貼', condition: (wl) => wl.day_night === '中直' },
    ];

    for (const af of allowanceFields) {
      const rate = Number((salarySetting as any)[af.field]) || 0;
      if (rate === 0) continue;

      let days = 0;
      if (af.condition) {
        const matchDates = new Set(workLogs.filter(af.condition).map(wl => wl.scheduled_date));
        days = matchDates.size;
      } else {
        const workDates = new Set(workLogs.map(wl => wl.scheduled_date));
        days = workDates.size;
      }

      if (days === 0) continue;

      const amount = rate * days;
      allowanceTotal += amount;

      items.push({
        item_type: 'allowance',
        item_name: af.label,
        unit_price: rate,
        quantity: days,
        amount,
        sort_order: sortOrder++,
      });
    }

    // Custom allowances
    if (salarySetting.custom_allowances && Array.isArray(salarySetting.custom_allowances)) {
      for (const ca of salarySetting.custom_allowances) {
        if (!ca.amount || ca.amount === 0) continue;
        const workDates = new Set(workLogs.map(wl => wl.scheduled_date));
        const days = workDates.size;
        if (days === 0) continue;

        const amount = Number(ca.amount) * days;
        allowanceTotal += amount;

        items.push({
          item_type: 'allowance',
          item_name: ca.name || '自定義津貼',
          unit_price: Number(ca.amount),
          quantity: days,
          amount,
          sort_order: sortOrder++,
        });
      }
    }

    // ── (3) OT 計算 ──
    let otTotal = 0;
    const otRate = Number(salarySetting.ot_rate_standard) || 0;

    let totalOtHours = 0;
    for (const wl of workLogs) {
      if (wl.ot_quantity && Number(wl.ot_quantity) > 0) {
        totalOtHours += Number(wl.ot_quantity);
      }
    }

    if (otRate > 0 && totalOtHours > 0) {
      otTotal = otRate * totalOtHours;
      items.push({
        item_type: 'ot',
        item_name: 'OT 加班費',
        unit_price: otRate,
        quantity: totalOtHours,
        amount: otTotal,
        sort_order: sortOrder++,
      });
    }

    const otSlots: { field: string; label: string }[] = [
      { field: 'ot_1800_1900', label: 'OT 18:00-19:00' },
      { field: 'ot_1900_2000', label: 'OT 19:00-20:00' },
      { field: 'ot_0600_0700', label: 'OT 06:00-07:00' },
      { field: 'ot_0700_0800', label: 'OT 07:00-08:00' },
    ];

    for (const os of otSlots) {
      const rate = Number((salarySetting as any)[os.field]) || 0;
      if (rate === 0) continue;

      const otDays = new Set(
        workLogs.filter(wl => wl.ot_quantity && Number(wl.ot_quantity) > 0).map(wl => wl.scheduled_date)
      ).size;

      if (otDays === 0) continue;

      const amount = rate * otDays;
      otTotal += amount;

      items.push({
        item_type: 'ot',
        item_name: os.label,
        unit_price: rate,
        quantity: otDays,
        amount,
        sort_order: sortOrder++,
      });
    }

    // ── (4) 分傭計算 ──
    let commissionTotal = 0;

    if (salarySetting.is_piece_rate && salarySetting.fleet_rate_card_id) {
      const fleetRateCard = await this.fleetRateCardRepo.findOne({
        where: { id: salarySetting.fleet_rate_card_id },
      });

      if (fleetRateCard) {
        for (const wl of workLogs) {
          let rate = 0;
          if (wl.day_night === '夜') {
            rate = Number(fleetRateCard.night_rate) || 0;
          } else if (wl.day_night === '中直') {
            rate = Number(fleetRateCard.mid_shift_rate) || 0;
          } else {
            rate = Number(fleetRateCard.day_rate) || 0;
          }

          const qty = Number(wl.quantity) || 1;
          commissionTotal += rate * qty;
        }

        if (commissionTotal > 0) {
          items.push({
            item_type: 'commission',
            item_name: '司機分傭',
            unit_price: 0,
            quantity: workLogs.length,
            amount: commissionTotal,
            remarks: `車隊價目表 #${fleetRateCard.id}`,
            sort_order: sortOrder++,
          });
        }
      }
    }

    // ── (5) 強積金計算 ──
    const mpfPlan = emp.mpf_plan || 'industry';
    let mpfDeduction = 0;
    let mpfEmployer = 0;

    const grossIncome = baseAmount + allowanceTotal + otTotal + commissionTotal;

    if (mpfPlan === 'industry') {
      const workDatesForMpf = new Set(workLogs.map(wl => wl.scheduled_date));
      const mpfDays = workDatesForMpf.size;
      mpfDeduction = 50 * mpfDays;
      mpfEmployer = 50 * mpfDays;

      items.push({
        item_type: 'mpf_deduction',
        item_name: '強積金（行業計劃）',
        unit_price: 50,
        quantity: mpfDays,
        amount: -mpfDeduction,
        sort_order: sortOrder++,
      });
    } else {
      mpfDeduction = Math.min(grossIncome * 0.05, 1500);
      mpfEmployer = Math.min(grossIncome * 0.05, 1500);
      mpfDeduction = Math.round(mpfDeduction * 100) / 100;
      mpfEmployer = Math.round(mpfEmployer * 100) / 100;

      const planLabel = mpfPlan === 'manulife' ? 'Manulife' : mpfPlan === 'aia' ? 'AIA' : '一般計劃';

      items.push({
        item_type: 'mpf_deduction',
        item_name: `強積金（${planLabel}）`,
        unit_price: grossIncome,
        quantity: 0.05,
        amount: -mpfDeduction,
        remarks: `月入 5%，上限 $1,500`,
        sort_order: sortOrder++,
      });
    }

    const netAmount = grossIncome - mpfDeduction;

    return {
      salary_type: salaryType,
      base_rate: baseSalary,
      work_days: workDays,
      base_amount: baseAmount,
      allowance_total: allowanceTotal,
      ot_total: otTotal,
      commission_total: commissionTotal,
      mpf_deduction: mpfDeduction,
      mpf_plan: mpfPlan,
      mpf_employer: mpfEmployer,
      gross_income: grossIncome,
      net_amount: netAmount,
      items,
    };
  }

  // ── 更新糧單 ──────────────────────────────────────────────────
  async update(id: number, body: any) {
    const payroll = await this.payrollRepo.findOne({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    if (body.payment_date !== undefined) payroll.payment_date = body.payment_date;
    if (body.cheque_number !== undefined) payroll.cheque_number = body.cheque_number;
    if (body.notes !== undefined) payroll.notes = body.notes;
    if (body.status !== undefined) payroll.status = body.status;

    return this.payrollRepo.save(payroll);
  }

  // ── 批量確認 ──────────────────────────────────────────────────
  async bulkConfirm(ids: number[]) {
    await this.payrollRepo.update(
      { id: In(ids) },
      { status: 'confirmed' },
    );
    return { updated: ids.length };
  }

  // ── 批量標記已付款 ────────────────────────────────────────────
  async bulkMarkPaid(ids: number[], paymentDate?: string, chequeNumber?: string) {
    const updateData: any = { status: 'paid' };
    if (paymentDate) updateData.payment_date = paymentDate;
    if (chequeNumber) updateData.cheque_number = chequeNumber;

    await this.payrollRepo.update(
      { id: In(ids) },
      updateData,
    );
    return { updated: ids.length };
  }

  // ── 刪除糧單 ──────────────────────────────────────────────────
  async remove(id: number) {
    const payroll = await this.payrollRepo.findOne({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能刪除草稿狀態的糧單');
    }

    await this.payrollWorkLogRepo.delete({ payroll_id: id });
    await this.payrollAdjustmentRepo.delete({ payroll_id: id });
    await this.payrollItemRepo.delete({ payroll_id: id });
    await this.payrollRepo.remove(payroll);
    return { deleted: true };
  }

  // ── 重新計算糧單 ──────────────────────────────────────────────
  async recalculate(id: number) {
    const payroll = await this.payrollRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.company', 'adjustments'],
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能重新計算草稿狀態的糧單');
    }

    const empId = payroll.employee_id;
    const dateFrom = payroll.date_from || `${payroll.period}-01`;
    const dateTo = payroll.date_to || (() => {
      const [y, m] = payroll.period.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
    })();
    const cpId = payroll.company_profile_id;

    const emp = await this.employeeRepo.findOne({
      where: { id: empId },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const salarySetting = await this.salarySettingRepo.createQueryBuilder('ss')
      .where('ss.employee_id = :empId', { empId: emp.id })
      .andWhere('ss.effective_date <= :end', { end: dateTo })
      .orderBy('ss.effective_date', 'DESC')
      .getOne();

    if (!salarySetting) {
      throw new BadRequestException('此員工沒有薪酬配置，無法重新計算');
    }

    // Get active payroll work logs (use snapshot data, not original work logs)
    const pwls = await this.payrollWorkLogRepo.find({
      where: { payroll_id: id, is_excluded: false },
      order: { scheduled_date: 'ASC' },
    });

    // Convert PayrollWorkLog to WorkLog-like objects for calculation
    const workLogLike = pwls.map(pwl => ({
      id: pwl.work_log_id,
      scheduled_date: pwl.scheduled_date,
      service_type: pwl.service_type,
      day_night: pwl.day_night,
      start_location: pwl.start_location,
      end_location: pwl.end_location,
      machine_type: pwl.machine_type,
      tonnage: pwl.tonnage,
      equipment_number: pwl.equipment_number,
      quantity: pwl.quantity,
      unit: pwl.unit,
      ot_quantity: pwl.ot_quantity,
      ot_unit: pwl.ot_unit,
      remarks: pwl.remarks,
      company_profile_id: pwl.company_profile_id,
      client_id: pwl.client_id,
      quotation_id: pwl.quotation_id,
      matched_rate_card_id: pwl.matched_rate_card_id,
      matched_rate: pwl.matched_rate,
      matched_unit: pwl.matched_unit,
      matched_ot_rate: pwl.matched_ot_rate,
      price_match_status: pwl.price_match_status,
      price_match_note: pwl.price_match_note,
    })) as unknown as WorkLog[];

    const calc = await this.calculatePayroll(emp, salarySetting, workLogLike, dateFrom, dateTo, cpId);

    // Calculate adjustment total
    const adjustments = payroll.adjustments || [];
    const adjustmentTotal = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);

    // Update payroll items
    await this.payrollItemRepo.delete({ payroll_id: id });
    for (const item of calc.items) {
      const payrollItem = this.payrollItemRepo.create({
        ...item,
        payroll_id: id,
      });
      await this.payrollItemRepo.save(payrollItem);
    }

    // Update payroll totals
    payroll.salary_type = calc.salary_type;
    payroll.base_rate = calc.base_rate;
    payroll.work_days = calc.work_days;
    payroll.base_amount = calc.base_amount;
    payroll.allowance_total = calc.allowance_total;
    payroll.ot_total = calc.ot_total;
    payroll.commission_total = calc.commission_total;
    payroll.mpf_deduction = calc.mpf_deduction;
    payroll.mpf_plan = calc.mpf_plan;
    payroll.mpf_employer = calc.mpf_employer;
    payroll.adjustment_total = adjustmentTotal;
    payroll.net_amount = calc.net_amount + adjustmentTotal;

    await this.payrollRepo.save(payroll);

    return this.findOne(id);
  }

  // ── 編輯糧單工作記錄（只改糧單記錄）──────────────────────────
  async updatePayrollWorkLog(payrollId: number, pwlId: number, body: any) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.payrollWorkLogRepo.findOne({ where: { id: pwlId, payroll_id: payrollId } });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Update snapshot fields
    const editableFields = [
      'service_type', 'scheduled_date', 'day_night', 'start_location', 'end_location',
      'machine_type', 'tonnage', 'equipment_number', 'quantity', 'unit',
      'ot_quantity', 'ot_unit', 'remarks', 'client_name', 'contract_no',
    ];

    for (const field of editableFields) {
      if (body[field] !== undefined) {
        (pwl as any)[field] = body[field];
      }
    }

    pwl.is_modified = true;

    // Re-match price if relevant fields changed
    const priceRelatedFields = ['client_id', 'company_profile_id', 'machine_type', 'tonnage', 'day_night', 'start_location', 'end_location'];
    const hasPriceChange = priceRelatedFields.some(f => body[f] !== undefined);
    if (hasPriceChange) {
      await this.rematchPayrollWorkLogPrice(pwl);
    }

    // Recalculate line amount
    pwl.line_amount = this.calculateLineAmount(pwl);

    await this.payrollWorkLogRepo.save(pwl);

    return pwl;
  }

  // ── 編輯原始工作記錄（編輯大數據）──────────────────────────
  async updateOriginalWorkLog(payrollId: number, pwlId: number, body: any) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.payrollWorkLogRepo.findOne({ where: { id: pwlId, payroll_id: payrollId } });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    // Update original work log
    const editableFields = [
      'service_type', 'scheduled_date', 'day_night', 'start_location', 'end_location',
      'machine_type', 'tonnage', 'equipment_number', 'quantity', 'unit',
      'ot_quantity', 'ot_unit', 'remarks',
    ];

    const updateData: any = {};
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length > 0 && pwl.work_log_id) {
      await this.workLogRepo.update(pwl.work_log_id, updateData);
    }

    // Also update the snapshot in payroll_work_logs
    for (const field of editableFields) {
      if (body[field] !== undefined) {
        (pwl as any)[field] = body[field];
      }
    }

    // Re-match price
    await this.rematchPayrollWorkLogPrice(pwl);
    pwl.line_amount = this.calculateLineAmount(pwl);

    await this.payrollWorkLogRepo.save(pwl);

    return pwl;
  }

  // ── 從糧單移除工作記錄 ──────────────────────────────────────
  async excludePayrollWorkLog(payrollId: number, pwlId: number) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.payrollWorkLogRepo.findOne({ where: { id: pwlId, payroll_id: payrollId } });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    pwl.is_excluded = true;
    await this.payrollWorkLogRepo.save(pwl);

    return { success: true };
  }

  // ── 恢復已移除的工作記錄 ──────────────────────────────────────
  async restorePayrollWorkLog(payrollId: number, pwlId: number) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const pwl = await this.payrollWorkLogRepo.findOne({ where: { id: pwlId, payroll_id: payrollId } });
    if (!pwl) throw new NotFoundException('PayrollWorkLog not found');

    pwl.is_excluded = false;
    await this.payrollWorkLogRepo.save(pwl);

    return { success: true };
  }

  // ── 新增自定義調整項 ──────────────────────────────────────────
  async addAdjustment(payrollId: number, body: { item_name: string; amount: number; remarks?: string }) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const maxSort = await this.payrollAdjustmentRepo.createQueryBuilder('a')
      .where('a.payroll_id = :pid', { pid: payrollId })
      .select('MAX(a.sort_order)', 'max')
      .getRawOne();

    const adj = this.payrollAdjustmentRepo.create({
      payroll_id: payrollId,
      item_name: body.item_name,
      amount: body.amount,
      remarks: body.remarks || undefined,
      sort_order: (maxSort?.max || 0) + 1,
    });

    const saved = await this.payrollAdjustmentRepo.save(adj);

    // Recalculate adjustment total and net amount
    await this.recalcAdjustmentTotal(payrollId);

    return saved;
  }

  // ── 刪除自定義調整項 ──────────────────────────────────────────
  async removeAdjustment(payrollId: number, adjId: number) {
    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能編輯草稿狀態的糧單');
    }

    const adj = await this.payrollAdjustmentRepo.findOne({ where: { id: adjId, payroll_id: payrollId } });
    if (!adj) throw new NotFoundException('Adjustment not found');

    await this.payrollAdjustmentRepo.remove(adj);

    // Recalculate
    await this.recalcAdjustmentTotal(payrollId);

    return { success: true };
  }

  // ── 統計摘要 ──────────────────────────────────────────────────
  async getSummary(query: any) {
    const qb = this.payrollRepo.createQueryBuilder('p');

    if (query.period) {
      qb.andWhere('p.period = :period', { period: query.period });
    }
    if (query.company_profile_id) {
      qb.andWhere('p.company_profile_id = :cpId', { cpId: Number(query.company_profile_id) });
    }

    const result = await qb
      .select('COUNT(*)', 'count')
      .addSelect('SUM(p.base_amount)', 'total_base')
      .addSelect('SUM(p.allowance_total)', 'total_allowance')
      .addSelect('SUM(p.ot_total)', 'total_ot')
      .addSelect('SUM(p.commission_total)', 'total_commission')
      .addSelect('SUM(p.mpf_deduction)', 'total_mpf')
      .addSelect('SUM(p.net_amount)', 'total_net')
      .getRawOne();

    return {
      count: Number(result.count) || 0,
      total_base: Number(result.total_base) || 0,
      total_allowance: Number(result.total_allowance) || 0,
      total_ot: Number(result.total_ot) || 0,
      total_commission: Number(result.total_commission) || 0,
      total_mpf: Number(result.total_mpf) || 0,
      total_net: Number(result.total_net) || 0,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // ── 輔助方法 ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  /**
   * 為工作記錄添加價格資訊（從 rate card 取價）- 批量優化版本
   */
  private async enrichWorkLogsWithPrice(workLogs: WorkLog[]): Promise<any[]> {
    if (workLogs.length === 0) return [];

    // 批量加載所有相關客戶的 rate cards（只查一次）
    const clientIds = [...new Set(workLogs.filter(wl => wl.client_id).map(wl => wl.client_id!))];
    const companyProfileIds = [...new Set(workLogs.filter(wl => wl.company_profile_id).map(wl => wl.company_profile_id!))];

    // 批量加載 company profiles
    const companyProfileMap = new Map<number, number>(); // cpId -> companyId
    if (companyProfileIds.length > 0) {
      const cps = await this.companyProfileRepo.findBy({ id: In(companyProfileIds) });
      for (const cp of cps) {
        if ((cp as any).company_id) {
          companyProfileMap.set(cp.id, (cp as any).company_id);
        }
      }
    }

    // 批量加載所有相關 rate cards
    let allRateCards: RateCard[] = [];
    if (clientIds.length > 0) {
      allRateCards = await this.rateCardRepo.createQueryBuilder('rc')
        .where('rc.status = :status', { status: 'active' })
        .andWhere('rc.client_id IN (:...clientIds)', { clientIds })
        .orderBy('rc.effective_date', 'DESC')
        .getMany();
    }

    const result: any[] = [];

    for (const wl of workLogs) {
      const enriched: any = { ...wl };

      // Use existing matched price if available
      if (wl.price_match_status === 'matched' && wl.matched_rate) {
        const rate = Number(wl.matched_rate) || 0;
        const qty = Number(wl.quantity) || 1;
        enriched._matched_rate_card_id = wl.matched_rate_card_id;
        enriched._matched_rate = wl.matched_rate;
        enriched._matched_unit = wl.matched_unit;
        enriched._matched_ot_rate = wl.matched_ot_rate;
        enriched._price_match_status = wl.price_match_status;
        enriched._price_match_note = wl.price_match_note;
        enriched._line_amount = rate * qty;
        enriched._group_key = this.buildGroupKeyFromWorkLog(wl);
      } else if (wl.client_id) {
        // Match in memory from pre-loaded rate cards
        const companyId = wl.company_profile_id ? (companyProfileMap.get(wl.company_profile_id) ?? null) : null;
        const tonnageNum = wl.tonnage ? wl.tonnage.replace('噸', '') : null;
        const clientCards = allRateCards.filter(rc => rc.client_id === wl.client_id);

        const card = this.tryMatchRateCardInMemory(
          clientCards,
          companyId,
          wl.quotation_id,
          wl.machine_type,
          tonnageNum,
          wl.start_location,
          wl.end_location,
        );

        if (card) {
          const { rate, unit } = this.resolveRate(card, wl.day_night);
          const qty = Number(wl.quantity) || 1;
          enriched._matched_rate_card_id = card.id;
          enriched._matched_rate = rate;
          enriched._matched_unit = unit;
          enriched._matched_ot_rate = card.ot_rate;
          enriched._price_match_status = 'matched';
          enriched._price_match_note = `匹配到：${(card as any).name || card.contract_no || `RateCard#${card.id}`}`;
          enriched._line_amount = rate * qty;
        } else {
          enriched._matched_rate_card_id = null;
          enriched._matched_rate = null;
          enriched._matched_unit = null;
          enriched._matched_ot_rate = null;
          enriched._price_match_status = 'unmatched';
          enriched._price_match_note = '未設定';
          enriched._line_amount = 0;
        }
        enriched._group_key = this.buildGroupKeyFromWorkLog(wl);
      } else {
        enriched._matched_rate_card_id = null;
        enriched._matched_rate = null;
        enriched._matched_unit = null;
        enriched._matched_ot_rate = null;
        enriched._price_match_status = 'unmatched';
        enriched._price_match_note = '未設定（無客戶）';
        enriched._line_amount = 0;
        enriched._group_key = this.buildGroupKeyFromWorkLog(wl);
      }

      result.push(enriched);
    }

    return result;
  }

  /**
   * 在內存中匹配 rate card（批量優化，避免 N+1 查詢）
   */
  private tryMatchRateCardInMemory(
    clientCards: RateCard[],
    companyId: number | null,
    quotationId: number | null,
    vehicleType: string | null,
    tonnage: string | null,
    origin: string | null,
    destination: string | null,
  ): RateCard | null {
    const attempts = [
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: false, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: false, useTonnage: false, useRoute: false },
    ];

    for (const attempt of attempts) {
      const matched = clientCards.filter(rc => {
        if (attempt.useCompany && companyId && (rc as any).company_id !== companyId) return false;
        if (attempt.useQuotation && quotationId && (rc as any).source_quotation_id !== quotationId) return false;
        if (attempt.useVehicle && vehicleType && rc.vehicle_type !== vehicleType) return false;
        if (attempt.useTonnage && tonnage && rc.vehicle_tonnage !== tonnage) return false;
        if (attempt.useRoute) {
          if (origin && rc.origin && !rc.origin.toLowerCase().includes(origin.toLowerCase())) return false;
          if (destination && rc.destination && !rc.destination.toLowerCase().includes(destination.toLowerCase())) return false;
        }
        return true;
      });

      // Sort by effective_date DESC and take first
      if (matched.length > 0) {
        matched.sort((a, b) => {
          const da = (a as any).effective_date || '';
          const db = (b as any).effective_date || '';
          return db.localeCompare(da);
        });
        return matched[0];
      }
    }

    return null;
  }

  /**
   * 為單個工作記錄匹配 rate card（保留供其他地方使用）
   */
  private async matchRateCardForWorkLog(wl: WorkLog): Promise<{ card: RateCard; rate: number; unit: string } | null> {
    if (!wl.client_id) return null;

    let companyId: number | null = null;
    if (wl.company_profile_id) {
      const cp = await this.companyProfileRepo.findOne({ where: { id: wl.company_profile_id } });
      if (cp && (cp as any).company_id) {
        companyId = (cp as any).company_id;
      }
    }

    const tonnageNum = wl.tonnage ? wl.tonnage.replace('噸', '') : null;

    const card = await this.tryMatchRateCard(
      wl.client_id,
      companyId,
      wl.quotation_id,
      wl.machine_type,
      tonnageNum,
      wl.start_location,
      wl.end_location,
    );

    if (!card) return null;

    const { rate, unit } = this.resolveRate(card, wl.day_night);
    return { card, rate, unit };
  }

  /**
   * 多層次模糊匹配 rate card（保留供 matchRateCardForWorkLog 使用）
   */
  private async tryMatchRateCard(
    clientId: number,
    companyId: number | null,
    quotationId: number | null,
    vehicleType: string | null,
    tonnage: string | null,
    origin: string | null,
    destination: string | null,
  ): Promise<RateCard | null> {
    const attempts = [
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: true, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: true, useQuotation: true, useVehicle: false, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: true, useRoute: true },
      { useCompany: false, useQuotation: false, useVehicle: true, useTonnage: false, useRoute: false },
      { useCompany: false, useQuotation: false, useVehicle: false, useTonnage: false, useRoute: false },
    ];

    for (const attempt of attempts) {
      const qb = this.rateCardRepo.createQueryBuilder('rc')
        .where('rc.status = :status', { status: 'active' })
        .andWhere('rc.client_id = :clientId', { clientId });

      if (attempt.useCompany && companyId) {
        qb.andWhere('rc.company_id = :companyId', { companyId });
      }
      if (attempt.useQuotation && quotationId) {
        qb.andWhere('rc.source_quotation_id = :quotationId', { quotationId });
      }
      if (attempt.useVehicle && vehicleType) {
        qb.andWhere('rc.vehicle_type = :vehicleType', { vehicleType });
      }
      if (attempt.useTonnage && tonnage) {
        qb.andWhere('rc.vehicle_tonnage = :tonnage', { tonnage });
      }
      if (attempt.useRoute) {
        if (origin) qb.andWhere('rc.origin ILIKE :origin', { origin: `%${origin}%` });
        if (destination) qb.andWhere('rc.destination ILIKE :destination', { destination: `%${destination}%` });
      }

      qb.orderBy('rc.effective_date', 'DESC').limit(1);

      const card = await qb.getOne();
      if (card) return card;
    }

    return null;
  }

  /**
   * 根據日/夜/中直取對應費率
   */
  private resolveRate(card: RateCard, dayNight: string | null): { rate: number; unit: string } {
    if (dayNight === '夜') {
      return { rate: Number(card.night_rate) || 0, unit: card.night_unit || card.day_unit || '' };
    }
    if (dayNight === '中直') {
      return { rate: Number(card.mid_shift_rate) || 0, unit: card.mid_shift_unit || card.day_unit || '' };
    }
    return { rate: Number(card.day_rate) || 0, unit: card.day_unit || '' };
  }

  /**
   * 從工作記錄構建歸組鍵
   */
  private buildGroupKeyFromWorkLog(wl: any): string {
    const parts = [
      wl.client?.name || wl.client_name || `client_${wl.client_id || ''}`,
      wl.quotation?.quotation_number || wl.contract_no || `q_${wl.quotation_id || ''}`,
      wl.service_type || '',
      wl.day_night || '日',
      wl.start_location || '',
      wl.end_location || '',
      wl.machine_type || '',
      wl.tonnage || '',
    ];
    return parts.join('|');
  }

  /**
   * 從 PayrollWorkLog 構建歸組結算
   */
  private buildGroupedSettlement(pwls: PayrollWorkLog[]): any[] {
    const groups = new Map<string, {
      group_key: string;
      client_name: string;
      contract_no: string;
      service_type: string;
      day_night: string;
      start_location: string;
      end_location: string;
      machine_type: string;
      tonnage: string;
      matched_rate: number | null;
      matched_unit: string | null;
      total_quantity: number;
      total_amount: number;
      count: number;
      price_match_status: string;
      work_log_ids: number[];
    }>();

    for (const pwl of pwls) {
      const key = pwl.group_key || this.buildGroupKeyFromPwl(pwl);
      const existing = groups.get(key);

      if (existing) {
        existing.total_quantity += Number(pwl.quantity) || 1;
        existing.total_amount += Number(pwl.line_amount) || 0;
        existing.count += 1;
        existing.work_log_ids.push(pwl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: pwl.client_name || '',
          contract_no: pwl.contract_no || '',
          service_type: pwl.service_type || '',
          day_night: pwl.day_night || '日',
          start_location: pwl.start_location || '',
          end_location: pwl.end_location || '',
          machine_type: pwl.machine_type || '',
          tonnage: pwl.tonnage || '',
          matched_rate: pwl.matched_rate ? Number(pwl.matched_rate) : null,
          matched_unit: pwl.matched_unit || null,
          total_quantity: Number(pwl.quantity) || 1,
          total_amount: Number(pwl.line_amount) || 0,
          count: 1,
          price_match_status: pwl.price_match_status || 'unmatched',
          work_log_ids: [pwl.id],
        });
      }
    }

    return Array.from(groups.values());
  }

  /**
   * 從 enriched WorkLog 構建歸組結算（用於 preview）
   */
  private buildGroupedSettlementFromWorkLogs(workLogs: any[]): any[] {
    const groups = new Map<string, any>();

    for (const wl of workLogs) {
      const key = wl._group_key || this.buildGroupKeyFromWorkLog(wl);
      const existing = groups.get(key);

      if (existing) {
        existing.total_quantity += Number(wl.quantity) || 1;
        existing.total_amount += Number(wl._line_amount) || 0;
        existing.count += 1;
        existing.work_log_ids.push(wl.id);
      } else {
        groups.set(key, {
          group_key: key,
          client_name: wl.client?.name || '',
          contract_no: wl.quotation?.quotation_number || '',
          service_type: wl.service_type || '',
          day_night: wl.day_night || '日',
          start_location: wl.start_location || '',
          end_location: wl.end_location || '',
          machine_type: wl.machine_type || '',
          tonnage: wl.tonnage || '',
          matched_rate: wl._matched_rate ? Number(wl._matched_rate) : null,
          matched_unit: wl._matched_unit || null,
          total_quantity: Number(wl.quantity) || 1,
          total_amount: Number(wl._line_amount) || 0,
          count: 1,
          price_match_status: wl._price_match_status || 'unmatched',
          work_log_ids: [wl.id],
        });
      }
    }

    return Array.from(groups.values());
  }

  private buildGroupKeyFromPwl(pwl: PayrollWorkLog): string {
    const parts = [
      pwl.client_name || `client_${pwl.client_id || ''}`,
      pwl.contract_no || `q_${pwl.quotation_id || ''}`,
      pwl.service_type || '',
      pwl.day_night || '日',
      pwl.start_location || '',
      pwl.end_location || '',
      pwl.machine_type || '',
      pwl.tonnage || '',
    ];
    return parts.join('|');
  }

  /**
   * 計算單筆工作記錄金額
   */
  private calculateLineAmount(pwl: PayrollWorkLog): number {
    if (!pwl.matched_rate || pwl.price_match_status !== 'matched') return 0;
    const rate = Number(pwl.matched_rate) || 0;
    const qty = Number(pwl.quantity) || 1;
    return rate * qty;
  }

  /**
   * 重新匹配 PayrollWorkLog 的價格
   */
  private async rematchPayrollWorkLogPrice(pwl: PayrollWorkLog): Promise<void> {
    if (!pwl.client_id) {
      pwl.price_match_status = 'pending';
      pwl.price_match_note = '缺少客戶資訊';
      pwl.matched_rate_card_id = null as any;
      pwl.matched_rate = null as any;
      pwl.matched_unit = null as any;
      pwl.matched_ot_rate = null as any;
      return;
    }

    let companyId: number | null = null;
    if (pwl.company_profile_id) {
      const cp = await this.companyProfileRepo.findOne({ where: { id: pwl.company_profile_id } });
      if (cp && (cp as any).company_id) {
        companyId = (cp as any).company_id;
      }
    }

    const tonnageNum = pwl.tonnage ? pwl.tonnage.replace('噸', '') : null;

    const card = await this.tryMatchRateCard(
      pwl.client_id,
      companyId,
      pwl.quotation_id,
      pwl.machine_type,
      tonnageNum,
      pwl.start_location,
      pwl.end_location,
    );

    if (!card) {
      pwl.price_match_status = 'unmatched';
      pwl.price_match_note = '未設定';
      pwl.matched_rate_card_id = null as any;
      pwl.matched_rate = null as any;
      pwl.matched_unit = null as any;
      pwl.matched_ot_rate = null as any;
      return;
    }

    const { rate, unit } = this.resolveRate(card, pwl.day_night);
    pwl.matched_rate_card_id = card.id;
    pwl.matched_rate = rate;
    pwl.matched_unit = unit;
    pwl.matched_ot_rate = card.ot_rate ?? (null as any);
    pwl.price_match_status = 'matched';
    pwl.price_match_note = `匹配到：${card.name || card.contract_no || `RateCard#${card.id}`}`;
  }

  /**
   * 重算自定義調整總額並更新淨額
   */
  private async recalcAdjustmentTotal(payrollId: number): Promise<void> {
    const adjustments = await this.payrollAdjustmentRepo.find({ where: { payroll_id: payrollId } });
    const adjustmentTotal = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);

    const payroll = await this.payrollRepo.findOne({ where: { id: payrollId } });
    if (!payroll) return;

    const grossIncome = Number(payroll.base_amount) + Number(payroll.allowance_total) +
      Number(payroll.ot_total) + Number(payroll.commission_total);
    const mpfDeduction = Number(payroll.mpf_deduction);

    payroll.adjustment_total = adjustmentTotal;
    payroll.net_amount = grossIncome - mpfDeduction + adjustmentTotal;

    await this.payrollRepo.save(payroll);
  }
}
