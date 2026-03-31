import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationSequence } from './quotation-sequence.entity';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';
import { Project } from '../projects/project.entity';
import { ProjectSequence } from '../projects/project-sequence.entity';
import { RateCard } from '../rate-cards/rate-card.entity';

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation) private repo: Repository<Quotation>,
    @InjectRepository(QuotationItem) private itemRepo: Repository<QuotationItem>,
    @InjectRepository(QuotationSequence) private seqRepo: Repository<QuotationSequence>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(Partner) private partnerRepo: Repository<Partner>,
    @InjectRepository(Project) private projectRepo: Repository<Project>,
    @InjectRepository(ProjectSequence) private projectSeqRepo: Repository<ProjectSequence>,
    @InjectRepository(RateCard) private rateCardRepo: Repository<RateCard>,
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

  /**
   * Generate project number: {公司代碼}-{年份}-P{序號}
   */
  private async generateProjectNo(companyId: number): Promise<string> {
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    const prefix = company.internal_prefix;
    const year = String(new Date().getFullYear());

    return await this.dataSource.transaction(async (manager) => {
      let seq = await manager.findOne(ProjectSequence, {
        where: { prefix, year },
      });

      if (!seq) {
        seq = manager.create(ProjectSequence, { prefix, year, last_seq: 0 });
      }

      seq.last_seq += 1;
      await manager.save(seq);

      const seqStr = String(seq.last_seq).padStart(2, '0');
      return `${prefix}-${year}-P${seqStr}`;
    });
  }

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    company_id?: number; client_id?: number; status?: string;
    quotation_type?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('q')
      .leftJoinAndSelect('q.company', 'company')
      .leftJoinAndSelect('q.client', 'client')
      .leftJoinAndSelect('q.project', 'project');

    if (query.search) {
      qb.andWhere(
        '(q.quotation_no ILIKE :s OR q.project_name ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.company_id) qb.andWhere('q.company_id = :cid', { cid: query.company_id });
    if (query.client_id) qb.andWhere('q.client_id = :clid', { clid: query.client_id });
    if (query.status) qb.andWhere('q.status = :st', { st: query.status });
    if (query.quotation_type) qb.andWhere('q.quotation_type = :qt', { qt: query.quotation_type });

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
      relations: ['company', 'client', 'items', 'project'],
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

    const { items, company, client, project, created_at, updated_at, id: _id, ...updateData } = dto;

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

  /**
   * Accept a quotation and generate related records:
   * - For project type: create a Project + generate rate card records
   * - For rental type: generate rate card records only
   */
  async acceptQuotation(id: number, options?: {
    project_name?: string;
    effective_date?: string;
    expiry_date?: string;
  }) {
    const quotation = await this.repo.findOne({
      where: { id },
      relations: ['company', 'client', 'items'],
    });
    if (!quotation) throw new NotFoundException('報價單不存在');
    if (quotation.status === 'accepted') {
      throw new BadRequestException('報價單已經被接受');
    }

    // Update status to accepted
    await this.repo.update(id, { status: 'accepted' });

    let project: Project | null = null;

    // For project type: create a project
    if (quotation.quotation_type === 'project') {
      const project_no = await this.generateProjectNo(quotation.company_id);
      const projectEntity = this.projectRepo.create({
        project_no,
        project_name: options?.project_name || quotation.project_name || quotation.quotation_no,
        company_id: quotation.company_id,
        client_id: quotation.client_id,
        status: 'in_progress',
      });
      project = await (this.projectRepo.save(projectEntity) as any) as Project;

      // Link quotation to project
      await this.repo.update(id, { project_id: project.id });
    }

    // Generate rate card records from quotation items
    if (quotation.items && quotation.items.length > 0) {
      for (const item of quotation.items) {
        const rateCardData: Partial<RateCard> = {
          company_id: quotation.company_id,
          client_id: quotation.client_id,
          name: item.description,
          service_type: quotation.quotation_type === 'project' ? '工程' : '租賃/運輸',
          rate_card_type: quotation.quotation_type === 'project' ? 'project' : 'rental',
          day_rate: Number(item.unit_price) || 0,
          day_unit: item.unit,
          effective_date: options?.effective_date || quotation.quotation_date,
          expiry_date: options?.expiry_date || undefined,
          source_quotation_id: quotation.id,
          project_id: project?.id || undefined,
          remarks: item.remarks || undefined,
          status: 'active',
        };
        const rateCard = this.rateCardRepo.create(rateCardData as any);
        await this.rateCardRepo.save(rateCard);
      }
    }

    return this.findOne(id);
  }

  /**
   * Get quotations linked to a specific project
   */
  async findByProject(projectId: number) {
    return this.repo.find({
      where: { project_id: projectId },
      relations: ['company', 'client'],
      order: { created_at: 'DESC' },
    });
  }
}
