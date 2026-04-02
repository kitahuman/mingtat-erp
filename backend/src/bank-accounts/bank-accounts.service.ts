import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BankAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.bankAccount.findMany({
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { transactions: true } },
      },
    });
  }

  async findOne(id: number) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: {
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
    remarks?: string;
  }) {
    return this.prisma.bankAccount.create({ data });
  }

  async update(
    id: number,
    data: {
      account_name?: string;
      bank_name?: string;
      account_no?: string;
      currency?: string;
      is_active?: boolean;
      remarks?: string;
    },
  ) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({ where: { id }, data });
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
      select: { id: true, account_name: true, bank_name: true, account_no: true, currency: true },
      orderBy: { id: 'asc' },
    });
  }
}
