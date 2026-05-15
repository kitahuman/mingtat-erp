import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.bankAccount.findMany({
      orderBy: { id: 'asc' },
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        _count: { select: { transactions: true } },
      },
    });
  }

  async findOne(id: number) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        _count: { select: { transactions: true } },
      },
    });
    if (!account) throw new NotFoundException('銀行帳戶不存在');
    return account;
  }

  async create(data: {
    account_name: string;
    bank_name: string;
    account_no: string;
    currency?: string;
    company_id?: number;
    opening_balance?: number | string | null;
    remarks?: string;
  }) {
    return this.prisma.bankAccount.create({
      data: {
        account_name: data.account_name,
        bank_name: data.bank_name,
        account_no: data.account_no,
        currency: data.currency || 'HKD',
        company_id: data.company_id || null,
        opening_balance: data.opening_balance != null && data.opening_balance !== '' ? new Prisma.Decimal(data.opening_balance) : null,
        remarks: data.remarks || null,
      },
      include: {
        company: { select: { id: true, name: true, name_en: true } },
      },
    });
  }

  async update(
    id: number,
    data: {
      account_name?: string;
      bank_name?: string;
      account_no?: string;
      currency?: string;
      company_id?: number;
      opening_balance?: number | string | null;
      is_active?: boolean;
      remarks?: string;
    },
  ) {
    await this.findOne(id);
    const updateData: any = { ...data };
    // Allow explicitly setting company_id to null
    if ('company_id' in data) {
      updateData.company_id = data.company_id || null;
    }
    if ('opening_balance' in data) {
      updateData.opening_balance = data.opening_balance != null && data.opening_balance !== ''
        ? new Prisma.Decimal(data.opening_balance)
        : null;
    }
    return this.prisma.bankAccount.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true, name_en: true } },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    // Check if there are transactions
    const count = await this.prisma.bankTransaction.count({
      where: { bank_account_id: id },
    });
    if (count > 0) {
      throw new Error('此帳戶下有交易記錄，無法刪除');
    }
    return this.prisma.bankAccount.delete({ where: { id } });
  }

  /** Simple list for dropdowns */
  async simple() {
    return this.prisma.bankAccount.findMany({
      where: { is_active: true },
      select: {
        id: true,
        account_name: true,
        bank_name: true,
        account_no: true,
        currency: true,
        opening_balance: true,
        company_id: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { id: 'asc' },
    });
  }
}
