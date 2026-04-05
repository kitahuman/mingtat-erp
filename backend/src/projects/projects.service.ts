import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    company_id?: number; client_id?: number; contract_id?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.company_id) where.company_id = Number(query.company_id);
    if (query.client_id) where.client_id = Number(query.client_id);
    if (query.contract_id) where.contract_id = Number(query.contract_id);
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
        include: {
          company: true,
          client: true,
          contract: { select: { id: true, contract_no: true, contract_name: true, client: { select: { id: true, name: true } } } },
        },
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
      include: {
        company: true,
        client: true,
        contract: { select: { id: true, contract_no: true, contract_name: true, client: { select: { id: true, name: true } } } },
      },
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

  /**
   * Resolve client_id from contract if contract_id is provided.
   * If contract_id is set, client_id is forced from the contract (ignoring frontend value).
   * If no contract, client_id must be explicitly provided.
   * Final validation: client_id must not be empty.
   */
  private async resolveClientId(dto: any): Promise<{ contract_id: number | null; client_id: number }> {
    const contractId = dto.contract_id ? Number(dto.contract_id) : null;
    let clientId: number | null = null;

    if (contractId) {
      // If contract is selected, force client_id from contract
      const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new BadRequestException('合約不存在');
      clientId = contract.client_id;
    } else {
      // No contract — use the client_id from frontend
      clientId = dto.client_id ? Number(dto.client_id) : null;
    }

    // Final validation: client_id is required
    if (!clientId) {
      throw new BadRequestException('請選擇客戶');
    }

    return { contract_id: contractId, client_id: clientId };
  }

  /** Sanitize DTO before passing to Prisma */
  private sanitizeDto(dto: any) {
    // Allowed string fields (String?)
    const strOptionals = ['project_name', 'description', 'address', 'remarks', 'client_contract_no', 'status'];
    // Date fields (DateTime?)
    const dateOptionals = ['start_date', 'end_date'];
    // Int fields (Int?)
    const intOptionals = ['client_id', 'contract_id'];

    const out: any = {};

    for (const f of strOptionals) {
      if (f in dto) out[f] = (dto[f] === '' || dto[f] === undefined) ? null : dto[f];
    }
    for (const f of dateOptionals) {
      if (f in dto) out[f] = (dto[f] === '' || dto[f] === null || dto[f] === undefined) ? null : new Date(dto[f]);
    }
    for (const f of intOptionals) {
      if (f in dto) out[f] = (dto[f] === '' || dto[f] === null || dto[f] === undefined) ? null : Number(dto[f]);
    }

    return out;
  }

  async create(dto: any) {
    const project_no = await this.generateProjectNo(dto.company_id);
    const { contract_id, client_id } = await this.resolveClientId(dto);

    const sanitized = this.sanitizeDto(dto);

    const saved = await this.prisma.project.create({
      data: {
        project_no,
        project_name: sanitized.project_name ?? dto.project_name,
        company_id: Number(dto.company_id),
        client_id,
        contract_id,
        status: sanitized.status ?? dto.status ?? 'pending',
        description: sanitized.description,
        address: sanitized.address,
        start_date: sanitized.start_date,
        end_date: sanitized.end_date,
        remarks: sanitized.remarks,
        client_contract_no: sanitized.client_contract_no,
      },
    });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');

    const { contract_id, client_id } = await this.resolveClientId(dto);
    const sanitized = this.sanitizeDto(dto);

    await this.prisma.project.update({
      where: { id },
      data: {
        project_name: sanitized.project_name ?? dto.project_name,
        status: sanitized.status ?? dto.status ?? existing.status,
        description: sanitized.description,
        address: sanitized.address,
        start_date: sanitized.start_date,
        end_date: sanitized.end_date,
        remarks: sanitized.remarks,
        client_contract_no: sanitized.client_contract_no,
        client_id,
        contract_id,
      },
    });
    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');
    await this.prisma.project.update({ where: { id }, data: { status } });
    return this.findOne(id);
  }
}
