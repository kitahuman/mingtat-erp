import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentOutService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    project_id?: number;
    expense_id?: number;
    date_from?: string;
    date_to?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.project_id) where.project_id = query.project_id;
    if (query.expense_id) where.expense_id = query.expense_id;
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentOut.findMany({
        where,
        include: {
          expense: {
            select: {
              id: true,
              item: true,
              total_amount: true,
              supplier_name: true,
              category: { select: { id: true, name: true } },
            },
          },
          project: { select: { id: true, project_no: true, project_name: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentOut.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentOut.findUnique({
      where: { id },
      include: {
        expense: {
          select: {
            id: true,
            item: true,
            total_amount: true,
            supplier_name: true,
            is_paid: true,
            date: true,
            remarks: true,
            category: { select: { id: true, name: true } },
            project: { select: { id: true, project_no: true, project_name: true } },
          },
        },
        project: { select: { id: true, project_no: true, project_name: true } },
        payroll_payments: {
          include: {
            payroll: {
              select: {
                id: true,
                period: true,
                date_from: true,
                date_to: true,
                employee: {
                  select: { id: true, name_zh: true, name_en: true },
                },
              },
            },
          },
          orderBy: { payroll_payment_date: 'desc' },
        },
      },
    });
    if (!record) throw new NotFoundException('付款記錄不存在');

    // Fetch matched bank transactions (月結單配對記錄)
    const matchedBankTransactions = await this.prisma.bankTransaction.findMany({
      where: {
        matched_type: 'payment_out',
        matched_id: id,
      },
      include: {
        bank_account: {
          select: { id: true, account_name: true, bank_name: true, account_no: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return { ...record, matched_bank_transactions: matchedBankTransactions };
  }

  async create(dto: {
    date: string;
    amount: number;
    expense_id?: number;
    project_id?: number;
    bank_account?: string;
    reference_no?: string;
    remarks?: string;
  }) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金額必須大於 0');
    }
    return this.prisma.paymentOut.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        expense_id: dto.expense_id || null,
        project_id: dto.project_id || null,
        bank_account: dto.bank_account || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || null,
      },
      include: {
        expense: {
          select: {
            id: true,
            item: true,
            total_amount: true,
            supplier_name: true,
            category: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, project_no: true, project_name: true } },
      },
    });
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');

    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.expense_id !== undefined) data.expense_id = dto.expense_id || null;
    if (dto.project_id !== undefined) data.project_id = dto.project_id || null;
    if (dto.bank_account !== undefined) data.bank_account = dto.bank_account;
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    return this.prisma.paymentOut.update({
      where: { id },
      data,
      include: {
        expense: {
          select: {
            id: true,
            item: true,
            total_amount: true,
            supplier_name: true,
            category: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, project_no: true, project_name: true } },
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.paymentOut.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('付款記錄不存在');
    await this.prisma.paymentOut.delete({ where: { id } });
    return { message: '已刪除' };
  }
}
