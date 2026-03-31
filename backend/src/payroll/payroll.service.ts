import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { Employee } from '../employees/employee.entity';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { WorkLog } from '../work-logs/work-log.entity';
import { FleetRateCard } from '../fleet-rate-cards/fleet-rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(Payroll)
    private payrollRepo: Repository<Payroll>,
    @InjectRepository(PayrollItem)
    private payrollItemRepo: Repository<PayrollItem>,
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

  // ── 詳情 ──────────────────────────────────────────────────────
  async findOne(id: number) {
    const payroll = await this.payrollRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.company', 'company_profile', 'items'],
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.items) {
      payroll.items.sort((a, b) => a.sort_order - b.sort_order);
    }
    return payroll;
  }

  // ── 預覽計糧（不儲存，返回計算結果和工作記錄明細）────────────
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
      .where('wl.employee_id = :empId', { empId: emp.id })
      .andWhere('wl.scheduled_date >= :start', { start: date_from })
      .andWhere('wl.scheduled_date <= :end', { end: date_to })
      .andWhere("wl.service_type != '請假/休息'")
      .orderBy('wl.scheduled_date', 'ASC');

    if (company_profile_id) {
      wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
    }

    const workLogs = await wlQb.getMany();

    // Calculate preview
    const calculation = salarySetting
      ? await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null)
      : null;

    return {
      employee: emp,
      salary_setting: salarySetting,
      work_logs: workLogs,
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
    period?: string; // optional override, defaults to YYYY-MM of date_from
  }) {
    const { employee_id, date_from, date_to, company_profile_id } = body;

    if (!employee_id) throw new BadRequestException('請選擇員工');
    if (!date_from || !date_to) throw new BadRequestException('請選擇日期範圍');
    if (date_from > date_to) throw new BadRequestException('開始日期不能晚於結束日期');

    // Derive period from date_from (YYYY-MM)
    const period = body.period || date_from.substring(0, 7);

    const emp = await this.employeeRepo.findOne({
      where: { id: employee_id },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Check for existing payroll with same employee, period, and company_profile
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
      .where('wl.employee_id = :empId', { empId: emp.id })
      .andWhere('wl.scheduled_date >= :start', { start: date_from })
      .andWhere('wl.scheduled_date <= :end', { end: date_to })
      .andWhere("wl.service_type != '請假/休息'");

    if (company_profile_id) {
      wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
    }

    const workLogs = await wlQb.getMany();

    const calc = await this.calculatePayroll(emp, salarySetting, workLogs, date_from, date_to, company_profile_id ?? null);

    // Determine actual company_profile_id
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
      net_amount: calc.net_amount,
      status: 'draft',
    });

    const saved = await this.payrollRepo.save(payroll) as Payroll;

    for (const item of calc.items) {
      const payrollItem = this.payrollItemRepo.create({
        ...item,
        payroll_id: saved.id,
      });
      await this.payrollItemRepo.save(payrollItem);
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

    await this.payrollItemRepo.delete({ payroll_id: id });
    await this.payrollRepo.remove(payroll);
    return { deleted: true };
  }

  // ── 重新計算糧單 ──────────────────────────────────────────────
  async recalculate(id: number) {
    const payroll = await this.payrollRepo.findOne({
      where: { id },
      relations: ['employee', 'employee.company'],
    });
    if (!payroll) throw new NotFoundException('Payroll not found');
    if (payroll.status !== 'draft') {
      throw new BadRequestException('只能重新計算草稿狀態的糧單');
    }

    await this.payrollItemRepo.delete({ payroll_id: id });

    const empId = payroll.employee_id;
    const dateFrom = payroll.date_from || `${payroll.period}-01`;
    const dateTo = payroll.date_to || (() => {
      const [y, m] = payroll.period.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      return `${payroll.period}-${String(lastDay).padStart(2, '0')}`;
    })();
    const cpId = payroll.company_profile_id;
    await this.payrollRepo.remove(payroll);

    const emp = await this.employeeRepo.findOne({
      where: { id: empId },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const newPayroll = await this.generate({
      employee_id: empId,
      date_from: dateFrom,
      date_to: dateTo,
      company_profile_id: cpId ?? undefined,
    }) as Payroll;
    return this.findOne(newPayroll!.id);
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
}
