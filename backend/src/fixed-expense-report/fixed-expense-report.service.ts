import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { roundMoney } from '../common/math.util';

@Injectable()
export class FixedExpenseReportService {
  constructor(private prisma: PrismaService) {}

  private toNum(value: unknown): number {
    return Number(value) || 0;
  }

  private round2(value: number): number {
    return roundMoney(value);
  }

  async getMonthlyStats(params: { year?: number; companyId?: number }) {
    const year = params.year || new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1900 || year > 3000) {
      throw new BadRequestException('年份格式不正確');
    }

    if (
      params.companyId !== undefined &&
      (!Number.isInteger(params.companyId) || params.companyId <= 0)
    ) {
      throw new BadRequestException('公司參數格式不正確');
    }

    const dateFrom = new Date(Date.UTC(year, 0, 1));
    const dateTo = new Date(Date.UTC(year + 1, 0, 1));

    const categories = await this.prisma.expenseCategory.findMany({
      where: { expense_category_is_fixed: true },
      select: {
        id: true,
        name: true,
        parent_id: true,
        sort_order: true,
      },
      orderBy: [
        { parent_id: 'asc' },
        { sort_order: 'asc' },
        { name: 'asc' },
      ],
    });

    const categoryIds = categories.map((category) => category.id);
    const emptyMonthlyAmounts = () =>
      Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        amount: 0,
      }));

    const rows = categories.map((category) => ({
      category_id: category.id,
      category_name: category.name,
      parent_id: category.parent_id,
      monthly_amounts: emptyMonthlyAmounts(),
      total_amount: 0,
    }));

    const rowByCategoryId = new Map(rows.map((row) => [row.category_id, row]));

    if (categoryIds.length > 0) {
      const expenseWhere: any = {
        deleted_at: null,
        category_id: { in: categoryIds },
        date: {
          gte: dateFrom,
          lt: dateTo,
        },
      };

      if (params.companyId !== undefined) {
        expenseWhere.company_id = params.companyId;
      }

      const expenses = await this.prisma.expense.findMany({
        where: expenseWhere,
        select: {
          category_id: true,
          date: true,
          total_amount: true,
        },
      });

      for (const expense of expenses) {
        if (!expense.category_id) continue;
        const row = rowByCategoryId.get(expense.category_id);
        if (!row) continue;

        const month = expense.date.getUTCMonth() + 1;
        const amount = this.toNum(expense.total_amount);
        row.monthly_amounts[month - 1].amount += amount;
        row.total_amount += amount;
      }
    }

    const totals = {
      monthly_amounts: emptyMonthlyAmounts(),
      total_amount: 0,
    };

    for (const row of rows) {
      row.monthly_amounts = row.monthly_amounts.map((item) => ({
        month: item.month,
        amount: this.round2(item.amount),
      }));
      row.total_amount = this.round2(row.total_amount);

      row.monthly_amounts.forEach((item, index) => {
        totals.monthly_amounts[index].amount += item.amount;
      });
      totals.total_amount += row.total_amount;
    }

    totals.monthly_amounts = totals.monthly_amounts.map((item) => ({
      month: item.month,
      amount: this.round2(item.amount),
    }));
    totals.total_amount = this.round2(totals.total_amount);

    return {
      year,
      company_id: params.companyId ?? null,
      months: Array.from({ length: 12 }, (_, index) => index + 1),
      categories: rows,
      totals,
    };
  }
}
