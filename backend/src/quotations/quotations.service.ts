import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'quotation_no', 'quotation_date', 'project_name', 'total_amount', 'status', 'created_at',
  ];

  /**
   * Generate quotation number:
   * Format with client code: {CompanyPrefix}Q{ClientCode}{YYMM}{4-digit hex seq}
   * Format without client code: {CompanyPrefix}Q{YYMM}{4-digit hex seq}
   */
  async generateQuotationNo(companyId: number, clientId: number | null, date: string): Promise<string> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    let clientCode = '';
    if (clientId) {
      const partner = await this.prisma.partner.findUnique({ where: { id: clientId } });
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

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.quotationSequence.findFirst({
        where: { prefix, year_month: yearMonth },
      });

      if (!seq) {
        seq = await tx.quotationSequence.create({
          data: { prefix, year_month: yearMonth, last_seq: 0 },
        });
      }

      const updated = await tx.quotationSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      const seqHex = updated.last_seq.toString(16).toUpperCase().padStart(4, '0');
      return `${prefix}${yearMonth}${seqHex}`;
    });
  }

  /**
   * Generate project number: {公司代碼}-{年份}-P{序號}
   */
  private async generateProjectNo(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company || !company.internal_prefix) {
      throw new NotFoundException('公司不存在或未設定前綴');
    }

    const prefix = company.internal_prefix;
    const year = String(new Date().getFullYear());

    return await this.prisma.$transaction(async (tx) => {
      let seq = await tx.projectSequence.findFirst({
        where: { prefix, year },
      });

      if (!seq) {
        seq = await tx.projectSequence.create({
          data: { prefix, year, last_seq: 0 },
        });
      }

      const updated = await tx.projectSequence.update({
        where: { id: seq.id },
        data: { last_seq: seq.last_seq + 1 },
      });

      const seqStr = String(updated.last_seq).padStart(2, '0');
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
    const where: any = {};

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.status) where.status = query.status;
    if (query.quotation_type) where.quotation_type = query.quotation_type;
    if (query.search) {
      where.OR = [
        { quotation_no: { contains: query.search, mode: 'insensitive' } },
        { project_name: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: { company: true, client: true, project: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { company: true, client: true, items: { orderBy: { sort_order: 'asc' } }, project: true },
    });
    if (!quotation) throw new NotFoundException('報價單不存在');
    return quotation;
  }

  async create(dto: any) {
    const { items, company, client, project, ...quotationData } = dto;

    // Generate quotation number
    const quotation_no = await this.generateQuotationNo(
      quotationData.company_id,
      quotationData.client_id,
      quotationData.quotation_date,
    );

    // Calculate total
    let total_amount = 0;
    const processedItems: any[] = [];
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const amount = Number(item.quantity || 0) * Number(item.unit_price || 0);
        total_amount += amount;
        processedItems.push({
          ...item,
          amount,
          sort_order: item.sort_order || i + 1,
          id: undefined,
        });
      }
    }

    const saved = await this.prisma.quotation.create({
      data: {
        ...quotationData,
        quotation_no,
        total_amount,
        quotation_date: new Date(quotationData.quotation_date),
        items: processedItems.length > 0 ? {
          create: processedItems.map(({ id: _id, quotation_id: _qid, ...item }) => item),
        } : undefined,
      },
    });

    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
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

    if (updateData.quotation_date) {
      updateData.quotation_date = new Date(updateData.quotation_date);
    }

    await this.prisma.quotation.update({ where: { id }, data: updateData });

    // Replace items if provided
    if (items !== undefined) {
      await this.prisma.quotationItem.deleteMany({ where: { quotation_id: id } });
      if (items.length > 0) {
        await this.prisma.quotationItem.createMany({
          data: items.map((item: any, index: number) => ({
            quotation_id: id,
            item_name: item.item_name,
            item_description: item.item_description,
            quantity: item.quantity || 0,
            unit: item.unit,
            unit_price: item.unit_price || 0,
            amount: item.amount || 0,
            remarks: item.remarks,
            sort_order: item.sort_order || index + 1,
          })),
        });
      }
    }

    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');
    await this.prisma.quotation.update({ where: { id }, data: { status } });

    // Cascade status to all three rate card tables when cancelled or rejected
    if (status === 'cancelled' || status === 'rejected') {
      await this.prisma.rateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
      await this.prisma.fleetRateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
      await this.prisma.subconRateCard.updateMany({
        where: { source_quotation_id: id },
        data: { status: 'cancelled' },
      });
    }

    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.quotation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('報價單不存在');

    // Cascade deleted status to all three rate card tables before removing
    await this.prisma.rateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });
    await this.prisma.fleetRateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });
    await this.prisma.subconRateCard.updateMany({
      where: { source_quotation_id: id },
      data: { status: 'deleted' },
    });

    await this.prisma.quotation.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Accept a quotation and generate related records
   */
  async acceptQuotation(id: number, options?: {
    project_name?: string;
    effective_date?: string;
    expiry_date?: string;
  }) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { company: true, client: true, items: true },
    });
    if (!quotation) throw new NotFoundException('報價單不存在');
    if (quotation.status === 'accepted') {
      throw new BadRequestException('報價單已經被接受');
    }

    await this.prisma.quotation.update({ where: { id }, data: { status: 'accepted' } });

    let projectId: number | null = null;

    // For project type: create a project
    if (quotation.quotation_type === 'project') {
      const project_no = await this.generateProjectNo(quotation.company_id);
      const project = await this.prisma.project.create({
        data: {
          project_no,
          project_name: options?.project_name || quotation.project_name || quotation.quotation_no,
          company_id: quotation.company_id,
          client_id: quotation.client_id,
          status: 'active',
        },
      });
      projectId = project.id;
      await this.prisma.quotation.update({ where: { id }, data: { project_id: projectId } });
    }

    // Generate rate card records from quotation items (all 3 tables)
    if (quotation.items && quotation.items.length > 0) {
      for (const item of quotation.items) {
        const itemName = item.item_name || '';
        const contractNo = (quotation as any).contract_name || undefined;
        const effectiveDate = options?.effective_date ? new Date(options.effective_date) : quotation.quotation_date;
        const expiryDate = options?.expiry_date ? new Date(options.expiry_date) : undefined;

        // 1. 租賃價目表
        await this.prisma.rateCard.create({
          data: {
            company_id: quotation.company_id,
            client_id: quotation.client_id!,
            contract_no: contractNo,
            name: itemName,
            description: item.item_description || undefined,
            service_type: quotation.quotation_type === 'project' ? '工程' : '租賃/運輸',
            rate_card_type: quotation.quotation_type === 'project' ? 'project' : 'rental',
            day_rate: Number(item.unit_price) || 0,
            day_unit: item.unit,
            effective_date: effectiveDate,
            expiry_date: expiryDate,
            source_quotation_id: quotation.id,
            project_id: projectId || undefined,
            remarks: item.remarks || undefined,
            status: 'active',
          },
        });

        // 2. 車隊價目表
        await this.prisma.fleetRateCard.create({
          data: {
            client_id: quotation.client_id,
            contract_no: contractNo,
            day_rate: 0,
            night_rate: 0,
            mid_shift_rate: 0,
            ot_rate: 0,
            unit: item.unit,
            remarks: item.remarks || undefined,
            source_quotation_id: quotation.id,
            status: 'active',
          },
        });

        // 3. 街車價目表
        await this.prisma.subconRateCard.create({
          data: {
            client_id: quotation.client_id,
            contract_no: contractNo,
            unit_price: 0,
            unit: item.unit,
            remarks: item.remarks || undefined,
            source_quotation_id: quotation.id,
            status: 'active',
          },
        });
      }
    }

    return this.findOne(id);
  }

  /**
   * Sync quotation items to rate cards (price list)
   */
  async syncToRateCards(id: number, options?: {
    effective_date?: string;
    expiry_date?: string;
    overwrite?: boolean;
  }) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { company: true, client: true, items: true },
    });
    if (!quotation) throw new NotFoundException('報價單不存在');

    const results = { created: 0, overwritten: 0, skipped: 0, conflicts: [] as any[] };

    if (!quotation.items || quotation.items.length === 0) {
      return results;
    }

    for (const item of quotation.items) {
      const itemName = item.item_name || '';
      const rateCardType = quotation.quotation_type === 'project' ? 'project' : 'rental';
      const contractNo = (quotation as any).contract_name || undefined;
      const effectiveDate = options?.effective_date ? new Date(options.effective_date) : quotation.quotation_date;
      const expiryDate = options?.expiry_date ? new Date(options.expiry_date) : undefined;

      // Check for existing duplicate
      const existing = await this.prisma.rateCard.findFirst({
        where: {
          client_id: quotation.client_id!,
          name: itemName,
          rate_card_type: rateCardType,
        },
      });

      if (existing && !options?.overwrite) {
        results.conflicts.push({ item_name: itemName, existing_id: existing.id });
        results.skipped++;
        continue;
      }

      const rateCardData: any = {
        company_id: quotation.company_id,
        client_id: quotation.client_id!,
        contract_no: contractNo,
        name: itemName,
        description: item.item_description || undefined,
        service_type: quotation.quotation_type === 'project' ? '工程' : '租賃/運輸',
        rate_card_type: rateCardType,
        day_rate: Number(item.unit_price) || 0,
        day_unit: item.unit,
        effective_date: effectiveDate,
        expiry_date: expiryDate,
        source_quotation_id: quotation.id,
        remarks: item.remarks || undefined,
        status: 'active',
      };

      if (existing && options?.overwrite) {
        await this.prisma.rateCard.update({ where: { id: existing.id }, data: rateCardData });
        results.overwritten++;
      } else {
        await this.prisma.rateCard.create({ data: rateCardData });
        results.created++;
      }

      // 2. 車隊價目表
      const existingFleet = await this.prisma.fleetRateCard.findFirst({
        where: { client_id: quotation.client_id, source_quotation_id: quotation.id },
      });
      if (!existingFleet || options?.overwrite) {
        const fleetData: any = {
          client_id: quotation.client_id,
          contract_no: contractNo,
          day_rate: 0, night_rate: 0, mid_shift_rate: 0, ot_rate: 0,
          unit: item.unit,
          remarks: item.remarks || undefined,
          source_quotation_id: quotation.id,
          status: 'active',
        };
        if (existingFleet && options?.overwrite) {
          await this.prisma.fleetRateCard.update({ where: { id: existingFleet.id }, data: fleetData });
        } else {
          await this.prisma.fleetRateCard.create({ data: fleetData });
        }
      }

      // 3. 街車價目表
      const existingSubcon = await this.prisma.subconRateCard.findFirst({
        where: { client_id: quotation.client_id, source_quotation_id: quotation.id },
      });
      if (!existingSubcon || options?.overwrite) {
        const subconData: any = {
          client_id: quotation.client_id,
          contract_no: contractNo,
          unit_price: 0,
          unit: item.unit,
          remarks: item.remarks || undefined,
          source_quotation_id: quotation.id,
          status: 'active',
        };
        if (existingSubcon && options?.overwrite) {
          await this.prisma.subconRateCard.update({ where: { id: existingSubcon.id }, data: subconData });
        } else {
          await this.prisma.subconRateCard.create({ data: subconData });
        }
      }
    }

    return results;
  }

  /**
   * Get quotations linked to a specific project
   */
  async findByProject(projectId: number) {
    return this.prisma.quotation.findMany({
      where: { project_id: projectId },
      include: { company: true, client: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
