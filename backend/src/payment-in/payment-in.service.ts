import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentInService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    source_type?: string;
    project_id?: number;
    contract_id?: number;
    date_from?: string;
    date_to?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.source_type) where.source_type = query.source_type;
    if (query.project_id) where.project_id = query.project_id;
    if (query.contract_id) where.contract_id = query.contract_id;
    if (query.date_from || query.date_to) {
      where.date = {};
      if (query.date_from) where.date.gte = new Date(query.date_from);
      if (query.date_to) where.date.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.paymentIn.findMany({
        where,
        include: {
          project: { select: { id: true, project_no: true, project_name: true } },
          contract: { select: { id: true, contract_no: true, contract_name: true } },
          bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.paymentIn.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentIn.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
        contract: { select: { id: true, contract_no: true, contract_name: true } },
        bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
      },
    });
    if (!record) throw new NotFoundException('收款記錄不存在');
    return record;
  }

  async create(dto: {
    date: string;
    amount: number;
    source_type: string;
    source_ref_id?: number;
    project_id?: number;
    contract_id?: number;
    bank_account_id?: number;
    reference_no?: string;
    remarks?: string;
  }) {
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('金額必須大於 0');
    }
    return this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.date),
        amount: dto.amount,
        source_type: dto.source_type,
        source_ref_id: dto.source_ref_id || null,
        project_id: dto.project_id || null,
        contract_id: dto.contract_id || null,
        bank_account_id: dto.bank_account_id || null,
        reference_no: dto.reference_no || null,
        remarks: dto.remarks || null,
      },
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
        contract: { select: { id: true, contract_no: true, contract_name: true } },
        bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
      },
    });
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');

    const data: any = {};
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (dto.amount <= 0) throw new BadRequestException('金額必須大於 0');
      data.amount = dto.amount;
    }
    if (dto.source_type !== undefined) data.source_type = dto.source_type;
    if (dto.source_ref_id !== undefined) data.source_ref_id = dto.source_ref_id;
    if (dto.project_id !== undefined) data.project_id = dto.project_id || null;
    if (dto.contract_id !== undefined) data.contract_id = dto.contract_id || null;
    if (dto.bank_account_id !== undefined) data.bank_account_id = dto.bank_account_id || null;
    if (dto.reference_no !== undefined) data.reference_no = dto.reference_no;
    if (dto.remarks !== undefined) data.remarks = dto.remarks;

    return this.prisma.paymentIn.update({
      where: { id },
      data,
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
        contract: { select: { id: true, contract_no: true, contract_name: true } },
        bank_account: { select: { id: true, account_name: true, bank_name: true, account_no: true } },
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.paymentIn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('收款記錄不存在');
    await this.prisma.paymentIn.delete({ where: { id } });
    return { message: '已刪除' };
  }
}
