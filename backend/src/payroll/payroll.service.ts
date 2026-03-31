import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
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
    // Sort items by sort_order
    if (payroll.items) {
      payroll.items.sort((a, b) => a.sort_order - b.sort_order);
    }
    return payroll;
  }

  // ── 生成計糧 ──────────────────────────────────────────────────
  async generate(body: { period: string; company_profile_id?: number }) {
    const { period, company_profile_id } = body;
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException('Invalid period format, expected YYYY-MM');
    }

    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const startDate = `${period}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

    // Find employees
    const empQb = this.employeeRepo.createQueryBuilder('e')
      .where('e.status = :status', { status: 'active' });
    
    // If company_profile_id is specified, find employees that have work logs for this company profile
    let employeeIds: number[] = [];
    
    if (company_profile_id) {
      // Get employee IDs from work logs for this period and company profile
      const workLogs = await this.workLogRepo.createQueryBuilder('wl')
        .select('DISTINCT wl.employee_id', 'employee_id')
        .where('wl.scheduled_date >= :start', { start: startDate })
        .andWhere('wl.scheduled_date <= :end', { end: endDate })
        .andWhere('wl.company_profile_id = :cpId', { cpId: Number(company_profile_id) })
        .andWhere('wl.employee_id IS NOT NULL')
        .getRawMany();
      
      employeeIds = workLogs.map(wl => wl.employee_id).filter(Boolean);
      if (employeeIds.length === 0) {
        return { generated: 0, skipped: 0, message: '此月份無符合條件的員工工作記錄' };
      }
    } else {
      // Get all employees with work logs in this period
      const workLogs = await this.workLogRepo.createQueryBuilder('wl')
        .select('DISTINCT wl.employee_id', 'employee_id')
        .where('wl.scheduled_date >= :start', { start: startDate })
        .andWhere('wl.scheduled_date <= :end', { end: endDate })
        .andWhere('wl.employee_id IS NOT NULL')
        .getRawMany();
      
      employeeIds = workLogs.map(wl => wl.employee_id).filter(Boolean);
      if (employeeIds.length === 0) {
        return { generated: 0, skipped: 0, message: '此月份無員工工作記錄' };
      }
    }

    const employees = await this.employeeRepo.find({
      where: { id: In(employeeIds), status: 'active' },
      relations: ['company'],
    });

    let generated = 0;
    let skipped = 0;

    for (const emp of employees) {
      // Check if payroll already exists
      const existingQb = this.payrollRepo.createQueryBuilder('p')
        .where('p.period = :period', { period })
        .andWhere('p.employee_id = :empId', { empId: emp.id });
      
      if (company_profile_id) {
        existingQb.andWhere('p.company_profile_id = :cpId', { cpId: Number(company_profile_id) });
      }

      const existing = await existingQb.getOne();
      if (existing) {
        skipped++;
        continue;
      }

      try {
        await this.generateForEmployee(emp, period, startDate, endDate, company_profile_id ? Number(company_profile_id) : null);
        generated++;
      } catch (err) {
        console.error(`Failed to generate payroll for employee ${emp.id}:`, err);
        skipped++;
      }
    }

    return { generated, skipped, message: `已生成 ${generated} 筆糧單，跳過 ${skipped} 筆` };
  }

  // ── 為單一員工生成計糧 ────────────────────────────────────────
  private async generateForEmployee(
    emp: Employee,
    period: string,
    startDate: string,
    endDate: string,
    companyProfileId: number | null,
  ) {
    // Get salary setting (latest effective before or during this period)
    const salarySetting = await this.salarySettingRepo.createQueryBuilder('ss')
      .where('ss.employee_id = :empId', { empId: emp.id })
      .andWhere('ss.effective_date <= :end', { end: endDate })
      .orderBy('ss.effective_date', 'DESC')
      .getOne();

    if (!salarySetting) return; // No salary config, skip

    // Get work logs for this period
    const wlQb = this.workLogRepo.createQueryBuilder('wl')
      .where('wl.employee_id = :empId', { empId: emp.id })
      .andWhere('wl.scheduled_date >= :start', { start: startDate })
      .andWhere('wl.scheduled_date <= :end', { end: endDate })
      .andWhere("wl.service_type != '請假/休息'");

    if (companyProfileId) {
      wlQb.andWhere('wl.company_profile_id = :cpId', { cpId: companyProfileId });
    }

    const workLogs = await wlQb.getMany();

    // Determine company_profile_id from work logs if not specified
    let actualCompanyProfileId = companyProfileId;
    if (!actualCompanyProfileId && workLogs.length > 0) {
      actualCompanyProfileId = workLogs[0].company_profile_id;
    }

    const items: Partial<PayrollItem>[] = [];
    let sortOrder = 1;

    const baseSalary = Number(salarySetting.base_salary) || 0;
    const salaryType = salarySetting.salary_type || 'daily';

    // ── (1) 底薪計算 ──
    let baseAmount = 0;
    let workDays = 0;

    if (salaryType === 'daily') {
      // Count distinct work dates
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
      // Monthly salary
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

    // Define allowance fields and their labels
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
        // Count days matching condition
        const matchDates = new Set(workLogs.filter(af.condition).map(wl => wl.scheduled_date));
        days = matchDates.size;
      } else {
        // Apply to all work days
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

    // Sum OT hours from work logs
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

    // OT time-slot allowances
    const otSlots: { field: string; label: string }[] = [
      { field: 'ot_1800_1900', label: 'OT 18:00-19:00' },
      { field: 'ot_1900_2000', label: 'OT 19:00-20:00' },
      { field: 'ot_0600_0700', label: 'OT 06:00-07:00' },
      { field: 'ot_0700_0800', label: 'OT 07:00-08:00' },
    ];

    for (const os of otSlots) {
      const rate = Number((salarySetting as any)[os.field]) || 0;
      if (rate === 0) continue;

      // These are per-day OT slot allowances, count OT days
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

    // ── (4) 分傭計算 (按件計酬) ──
    let commissionTotal = 0;

    if (salarySetting.is_piece_rate && salarySetting.fleet_rate_card_id) {
      // Get the fleet rate card
      const fleetRateCard = await this.fleetRateCardRepo.findOne({
        where: { id: salarySetting.fleet_rate_card_id },
      });

      if (fleetRateCard) {
        // Calculate commission based on work logs
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
      // 行業計劃（建造業）：僱員每日扣 $50，僱主每日供 $50
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
      // 一般計劃 (Manulife / AIA)：月入 5%，上限 $1500
      mpfDeduction = Math.min(grossIncome * 0.05, 1500);
      mpfEmployer = Math.min(grossIncome * 0.05, 1500);

      // Round to 2 decimal places
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

    // ── 淨額 ──
    const netAmount = grossIncome - mpfDeduction;

    // Create payroll record
    const payroll = this.payrollRepo.create({
      period,
      employee_id: emp.id,
      company_profile_id: actualCompanyProfileId ?? undefined,
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
      net_amount: netAmount,
      status: 'draft',
    });

    const saved = await this.payrollRepo.save(payroll) as Payroll;

    // Save items
    for (const item of items) {
      const payrollItem = this.payrollItemRepo.create({
        ...item,
        payroll_id: saved.id,
      });
      await this.payrollItemRepo.save(payrollItem);
    }

    return saved;
  }

  // ── 更新糧單 ──────────────────────────────────────────────────
  async update(id: number, body: any) {
    const payroll = await this.payrollRepo.findOne({ where: { id } });
    if (!payroll) throw new NotFoundException('Payroll not found');

    // Allow updating payment info and notes
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

    // Delete items first
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

    // Delete existing items
    await this.payrollItemRepo.delete({ payroll_id: id });

    // Remove old payroll
    const empId = payroll.employee_id;
    const period = payroll.period;
    const cpId = payroll.company_profile_id;
    await this.payrollRepo.remove(payroll);

    // Regenerate
    const emp = await this.employeeRepo.findOne({
      where: { id: empId },
      relations: ['company'],
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const startDate = `${period}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${period}-${String(lastDay).padStart(2, '0')}`;

    const newPayroll = await this.generateForEmployee(emp, period, startDate, endDate, cpId) as Payroll;
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
