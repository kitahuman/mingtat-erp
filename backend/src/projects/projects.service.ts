import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  private readonly allowedSortFields = [
    'id', 'project_no', 'project_name', 'status', 'start_date', 'end_date', 'created_at',
  ];

  /**
   * Generate project number: {公司代碼}-{年份}-P{序號}
   * 序號每年重置，兩位數字（01-99）
   */
  async generateProjectNo(companyId: number): Promise<string> {
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
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { project_no: { contains: query.search, mode: 'insensitive' } },
        { project_name: { contains: query.search, mode: 'insensitive' } },
        { address: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: { company: true, client: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { company: true, client: true },
    });
    if (!project) throw new NotFoundException('工程項目不存在');
    return project;
  }

  async findSimple() {
    return this.prisma.project.findMany({
      where: { status: 'active' },
      select: { id: true, project_no: true, project_name: true, company_id: true, client_id: true },
      orderBy: { project_no: 'desc' },
    });
  }

  async create(dto: any) {
    const project_no = await this.generateProjectNo(dto.company_id);
    const { company, client, ...data } = dto;
    const saved = await this.prisma.project.create({
      data: { ...data, project_no },
    });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');

    const { company, client, created_at, updated_at, id: _id, project_no, ...updateData } = dto;
    await this.prisma.project.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');
    await this.prisma.project.update({ where: { id }, data: { status } });
    return this.findOne(id);
  }
}
