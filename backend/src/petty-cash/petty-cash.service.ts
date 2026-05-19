import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PettyCashAdjustDto, PettyCashTopupDto } from './dto/petty-cash.dto';

type TxClient = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class PettyCashService {
  constructor(private readonly prisma: PrismaService) {}

  private toMoney(value: number): Prisma.Decimal {
    return new Prisma.Decimal((Number(value) || 0).toFixed(2));
  }

  private toNumber(value: any): number {
    return Number(value || 0);
  }

  private async findPettyCashCategoryId(tx: TxClient, categoryId?: number): Promise<number> {
    if (categoryId) return Number(categoryId);

    const category = await tx.expenseCategory.findFirst({
      where: { name: '零用金', is_active: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('找不到「零用金」支出類別，請先在支出類別管理建立該類別');
    }

    return category.id;
  }

  private async applyBalanceChange(
    tx: TxClient,
    params: {
      employeeId: number;
      date: Date;
      type: string;
      amount: number;
      description?: string | null;
      expenseId?: number | null;
      payrollId?: number | null;
      period?: string | null;
    },
  ) {
    const employee = await tx.employee.findUnique({
      where: { id: params.employeeId },
      select: { id: true, petty_cash_balance: true },
    });
    if (!employee) throw new NotFoundException('員工不存在');

    const currentBalance = this.toNumber(employee.petty_cash_balance);
    const nextBalance = currentBalance + Number(params.amount);

    await tx.employee.update({
      where: { id: params.employeeId },
      data: { petty_cash_balance: this.toMoney(nextBalance) },
    });

    return tx.pettyCashRecord.create({
      data: {
        employee_id: params.employeeId,
        date: params.date,
        type: params.type,
        amount: this.toMoney(params.amount),
        balance: this.toMoney(nextBalance),
        description: params.description || null,
        expense_id: params.expenseId ?? null,
        payroll_id: params.payrollId ?? null,
        period: params.period ?? null,
      },
    });
  }

  async getRecords(employeeId: number, query: { page?: number; limit?: number } = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const skip = (page - 1) * limit;

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name_zh: true, petty_cash_balance: true },
    });
    if (!employee) throw new NotFoundException('員工不存在');

    const [records, total] = await Promise.all([
      this.prisma.pettyCashRecord.findMany({
        where: { employee_id: employeeId },
        include: {
          expense: { select: { id: true, item: true, total_amount: true, date: true } },
          payroll: { select: { id: true, period: true, status: true, net_amount: true } },
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.pettyCashRecord.count({ where: { employee_id: employeeId } }),
    ]);

    return {
      employee_id: employee.id,
      employee_name: employee.name_zh,
      balance: employee.petty_cash_balance,
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBalance(employeeId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name_zh: true, petty_cash_balance: true },
    });
    if (!employee) throw new NotFoundException('員工不存在');
    return {
      employee_id: employee.id,
      employee_name: employee.name_zh,
      balance: employee.petty_cash_balance,
    };
  }

  async topup(dto: PettyCashTopupDto) {
    const amount = Number(dto.amount || 0);
    if (amount <= 0) throw new BadRequestException('派發金額必須大於 0');

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: Number(dto.employee_id) },
        select: { id: true, name_zh: true },
      });
      if (!employee) throw new NotFoundException('員工不存在');

      const categoryId = await this.findPettyCashCategoryId(tx as TxClient, dto.category_id);
      const date = dto.date ? new Date(dto.date) : new Date();
      const description = dto.description || `由公司派發零用金予 ${employee.name_zh}`;

      const expense = await tx.expense.create({
        data: {
          date,
          company_id: dto.company_id ? Number(dto.company_id) : null,
          category_id: categoryId,
          employee_id: Number(dto.employee_id),
          item: '零用金派發',
          total_amount: this.toMoney(amount),
          is_paid: true,
          payment_status: 'paid',
          payment_method: dto.payment_method || null,
          payment_date: dto.payment_date ? new Date(dto.payment_date) : date,
          payment_ref: dto.payment_ref || null,
          remarks: dto.remarks || description,
          source: 'MANUAL',
          expense_payment_method: 'COMPANY_PAID',
        },
      });

      const record = await this.applyBalanceChange(tx as TxClient, {
        employeeId: Number(dto.employee_id),
        date,
        type: 'TOPUP',
        amount,
        description,
        expenseId: expense.id,
      });

      return { success: true, expense, record };
    });
  }

  async adjust(dto: PettyCashAdjustDto) {
    const amount = Number(dto.amount || 0);
    if (amount === 0) throw new BadRequestException('調整金額不能為 0');

    return this.prisma.$transaction(async (tx) => {
      const record = await this.applyBalanceChange(tx as TxClient, {
        employeeId: Number(dto.employee_id),
        date: dto.date ? new Date(dto.date) : new Date(),
        type: 'ADJUST',
        amount,
        description: dto.description || '手動調整零用金',
      });
      return { success: true, record };
    });
  }

  async createTopupFromExpense(expenseId: number) {
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { category: true, employee: { select: { id: true, name_zh: true } } },
      });

      if (!expense || expense.deleted_at) return null;
      if (!expense.employee_id || !expense.category || expense.category.name !== '零用金') return null;

      const existing = await tx.pettyCashRecord.findFirst({ where: { expense_id: expenseId, type: 'TOPUP' } });
      if (existing) return existing;

      const amount = this.toNumber(expense.total_amount);
      if (amount <= 0) return null;

      return this.applyBalanceChange(tx as TxClient, {
        employeeId: expense.employee_id,
        date: expense.date,
        type: 'TOPUP',
        amount,
        description: expense.remarks || expense.item || `由公司派發零用金予 ${expense.employee?.name_zh || '員工'}`,
        expenseId: expense.id,
      });
    });
  }

  async settleForPayroll(payrollId: number, employeeId?: number, reimbursementTotal?: number) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pettyCashRecord.findFirst({
        where: { payroll_id: payrollId, type: { in: ['DEDUCT', 'CARRY_FORWARD'] } },
      });
      if (existing) {
        return { success: true, skipped: true, reason: '此糧單已存在零用金結算紀錄' };
      }

      const payroll = await tx.payroll.findUnique({
        where: { id: payrollId },
        include: {
          employee: { select: { id: true, name_zh: true, petty_cash_balance: true } },
          payroll_expenses: { include: { expense: true } },
        },
      });
      if (!payroll) throw new NotFoundException('Payroll not found');

      const targetEmployeeId = employeeId || payroll.employee_id;
      if (targetEmployeeId !== payroll.employee_id) {
        throw new BadRequestException('糧單員工與零用金結算員工不一致');
      }

      const reimbursement = reimbursementTotal ?? payroll.payroll_expenses.reduce((sum, pe) => {
        const expense = pe.expense;
        if (!expense || expense.deleted_at || expense.expense_payment_method !== 'SELF_PAID') return sum;
        return sum + this.toNumber(expense.total_amount);
      }, 0);

      const balanceBefore = this.toNumber(payroll.employee?.petty_cash_balance);
      if (reimbursement <= 0 || balanceBefore <= 0) {
        return {
          success: true,
          skipped: true,
          reimbursement_total: this.toMoney(reimbursement),
          petty_cash_balance_before: this.toMoney(balanceBefore),
          petty_cash_deducted: this.toMoney(0),
          petty_cash_balance_after: this.toMoney(balanceBefore),
        };
      }

      const deducted = Math.min(balanceBefore, reimbursement);
      const balanceAfter = balanceBefore - deducted;
      const payrollExtraAmount = reimbursement - deducted;
      const currentNetAmount = this.toNumber(payroll.net_amount);
      const currentAdjustmentTotal = this.toNumber(payroll.adjustment_total);
      const description = `${payroll.period} 扣除報銷 $${deducted.toFixed(2)}`;

      await tx.employee.update({
        where: { id: payroll.employee_id },
        data: { petty_cash_balance: this.toMoney(balanceAfter) },
      });

      const deductRecord = await tx.pettyCashRecord.create({
        data: {
          employee_id: payroll.employee_id,
          date: payroll.date_to || new Date(),
          type: 'DEDUCT',
          amount: this.toMoney(-deducted),
          balance: this.toMoney(balanceAfter),
          description,
          payroll_id: payroll.id,
          period: payroll.period,
        },
      });

      const carryForwardRecord = await tx.pettyCashRecord.create({
        data: {
          employee_id: payroll.employee_id,
          date: payroll.date_to || new Date(),
          type: 'CARRY_FORWARD',
          amount: this.toMoney(0),
          balance: this.toMoney(balanceAfter),
          description: `${payroll.period} 零用金結餘 C/D $${balanceAfter.toFixed(2)}`,
          payroll_id: payroll.id,
          period: payroll.period,
        },
      });

      await tx.payroll.update({
        where: { id: payroll.id },
        data: {
          adjustment_total: this.toMoney(currentAdjustmentTotal - deducted),
          net_amount: this.toMoney(currentNetAmount - deducted),
        },
      });

      return {
        success: true,
        reimbursement_total: this.toMoney(reimbursement),
        petty_cash_balance_before: this.toMoney(balanceBefore),
        petty_cash_deducted: this.toMoney(deducted),
        petty_cash_balance_after: this.toMoney(balanceAfter),
        payroll_reimbursement_payable: this.toMoney(payrollExtraAmount),
        deduct_record: deductRecord,
        carry_forward_record: carryForwardRecord,
      };
    });
  }

  async rollbackForPayroll(payrollId: number) {
    return this.prisma.$transaction(async (tx) => {
      const payroll = await tx.payroll.findUnique({ where: { id: payrollId } });
      if (!payroll) throw new NotFoundException('Payroll not found');

      const deductRecords = await tx.pettyCashRecord.findMany({
        where: { payroll_id: payrollId, type: 'DEDUCT' },
        orderBy: { id: 'asc' },
      });

      const restoredAmount = deductRecords.reduce((sum, record) => sum + Math.abs(this.toNumber(record.amount)), 0);
      if (restoredAmount <= 0) {
        await tx.pettyCashRecord.deleteMany({ where: { payroll_id: payrollId, type: 'CARRY_FORWARD' } });
        return { success: true, skipped: true, restored_amount: this.toMoney(0) };
      }

      const employee = await tx.employee.findUnique({
        where: { id: payroll.employee_id },
        select: { petty_cash_balance: true },
      });
      if (!employee) throw new NotFoundException('員工不存在');

      const balanceAfterRestore = this.toNumber(employee.petty_cash_balance) + restoredAmount;
      await tx.employee.update({
        where: { id: payroll.employee_id },
        data: { petty_cash_balance: this.toMoney(balanceAfterRestore) },
      });

      await tx.pettyCashRecord.deleteMany({ where: { payroll_id: payrollId } });

      await tx.payroll.update({
        where: { id: payroll.id },
        data: {
          adjustment_total: this.toMoney(this.toNumber(payroll.adjustment_total) + restoredAmount),
          net_amount: this.toMoney(this.toNumber(payroll.net_amount) + restoredAmount),
        },
      });

      return {
        success: true,
        restored_amount: this.toMoney(restoredAmount),
        petty_cash_balance_after: this.toMoney(balanceAfterRestore),
      };
    });
  }

  async getPayrollSettlement(payrollId: number) {
    const records = await this.prisma.pettyCashRecord.findMany({
      where: { payroll_id: payrollId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const deducted = records
      .filter((record) => record.type === 'DEDUCT')
      .reduce((sum, record) => sum + Math.abs(this.toNumber(record.amount)), 0);
    const carryForward = records.find((record) => record.type === 'CARRY_FORWARD');

    return {
      payroll_id: payrollId,
      petty_cash_deducted: this.toMoney(deducted),
      petty_cash_balance_after: carryForward?.balance ?? null,
      records,
    };
  }
}
