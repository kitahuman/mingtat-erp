import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationSequence } from './quotation-sequence.entity';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation) private repo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private itemRepo: Repository<QuotationItem>,
    @InjectRepository(QuotationSequence) private seqRepo: Repository<QuotationSequence>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(Partner) private partnerRepo: Repository<Partner>,
    private dataSource: DataSource,
  ) {}

  private readonly allowedSortFields = [
    'id', 'quotation_no', 'quotation_date', 'project_name', 'total_amount', 'status', 'created_at',
  ];

  /**
   * Generate quotation number:
   * Format with client code: {CompanyPrefix}Q{ClientCode}{YYMM}{4-digit hex seq}
   * Format without client code: {CompanyPrefix}Q{YYMM}{4-digit hex seq}
   */
  async generateQuotationNo(companyId: number, clientId: number | null, date: string): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    let clientCode = '';
    if (clientId) {
      const partner = await this.partnerRepo.findOne({ where: { id: clientId } });
      if (partner?.english_code) {
        clientCode = partner.english_code;
      }
    }

    const d = new Date(date);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${yy}${mm}`;

    const prefix = clientCode
      ? `${company.internal_prefix}Q${clientCode}`
      : `${company.internal_prefix}Q`;

    // Use transaction to safely increment sequence
    return await this.dataSource.transaction(async (manager) => {
      let seq = await manager.findOne(QuotationSequence, {
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = manager.create(QuotationSequence, {
          prefix,
          year_month: yearMonth,
          last_seq: 0,
        });
      }

      seq.last_seq += 1;
      await manager.save(seq);

      // Convert to 4-digit hex uppercase
      const seqHex = seq.last_seq.toString(16).toUpperCase().padStart(4, '0');
      return `${prefix}${yearMonth}${seqHex}`;
    });
  }

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    company_id?: number; client_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('q')
      .leftJoinAndSelect('q.company', 'company')
      .leftJoinAndSelect('q.client', 'client');

    if (query.search) {
      qb.andWhere(
        '(q.quotation_no ILIKE :s OR q.project_name ILIKE :s OR q.project_no ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.company_id) qb.andWhere('q.company_id = :cid', { cid: query.company_id });
    if (query.client_id) qb.andWhere('q.client_id = :clid', { clid: query.client_id });
    if (query.status) qb.andWhere('q.status = :st', { st: query.status });

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
    qb.orderBy(`q.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const quotation = await this.repo.findOne({
      where: { id },
      relations: ['company', 'client', 'items'],
    });
    if (!quotation) throw new NotFoundException('報價單不存在');
    // Sort items by sort_order
    if (quotation.items) {
      quotation.items.sort((a, b) => a.sort_order - b.sort_order);
    }
    return quotation;
  }

  async create(dto: any) {
    const { items, ...quotationData } = dto;

    // Generate quotation number
    const quotation_no = await this.generateQuotationNo(
      quotationData.company_id,
      quotationData.client_id,
      quotationData.quotation_date,
    );

    // Calculate total
    let total_amount = 0;
    if (items && items.length > 0) {
      for (const item of items) {
        item.amount = Number(item.quantity || 0) * Number(item.unit_price || 0);
        total_amount += item.amount;
      }
    }

    const quotation = this.repo.create({
      ...quotationData,
      quotation_no,
      total_amount,
    });

    const saved: Quotation = await (this.repo.save(quotation) as any);

    // Save items
    if (items && items.length > 0) {
      const itemEntities = items.map((item: any, index: number) =>
        this.itemRepo.create({
          ...item,
          quotation_id: saved.id,
          sort_order: item.sort_order || index + 1,
        }),
      );
      await this.itemRepo.save(itemEntities);
    }

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');

    const { items, company, client, created_at, updated_at, id: _id, ...updateData } = dto;

    // Recalculate total
    if (items && items.length > 0) {
      let total_amount = 0;
      for (const item of items) {
        item.amount = Number(item.quantity || 0) * Number(item.unit_price || 0);
        total_amount += item.amount;
      }
      updateData.total_amount = total_amount;
    }

    await this.repo.update(id, updateData);

    // Replace items if provided
    if (items !== undefined) {
      await this.itemRepo.delete({ quotation_id: id });
      if (items.length > 0) {
        const itemEntities = items.map((item: any, index: number) =>
          this.itemRepo.create({
            ...item,
            quotation_id: id,
            sort_order: item.sort_order || index + 1,
            id: undefined,
          }),
        );
        await this.itemRepo.save(itemEntities);
      }
    }

    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');
    await this.repo.update(id, { status });
    return this.findOne(id);
  }
}
