import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Project } from './project.entity';
import { ProjectSequence } from './project-sequence.entity';
import { Company } from '../companies/company.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private repo: Repository<Project>,
    @InjectRepository(ProjectSequence) private seqRepo: Repository<ProjectSequence>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    private dataSource: DataSource,
  ) {}

  private readonly allowedSortFields = [
    'id', 'project_no', 'project_name', 'status', 'start_date', 'end_date', 'created_at',
  ];

  /**
   * Generate project number: {公司代碼}-{年份}-P{序號}
   * 序號每年重置，兩位數字（01-99）
   */
  async generateProjectNo(companyId: number): Promise<string> {
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
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('p')
      .leftJoinAndSelect('p.company', 'company')
      .leftJoinAndSelect('p.client', 'client');

    if (query.search) {
      qb.andWhere(
        '(p.project_no ILIKE :s OR p.project_name ILIKE :s OR p.address ILIKE :s OR client.name ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.company_id) qb.andWhere('p.company_id = :cid', { cid: query.company_id });
    if (query.client_id) qb.andWhere('p.client_id = :clid', { clid: query.client_id });
    if (query.status) qb.andWhere('p.status = :st', { st: query.status });

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
    qb.orderBy(`p.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const project = await this.repo.findOne({
      where: { id },
      relations: ['company', 'client'],
    });
    if (!project) throw new NotFoundException('工程項目不存在');
    return project;
  }

  async findSimple() {
    return this.repo.find({
      where: { status: 'active' },
      select: ['id', 'project_no', 'project_name', 'company_id', 'client_id'],
      order: { project_no: 'DESC' },
    });
  }

  async create(dto: any) {
    const project_no = await this.generateProjectNo(dto.company_id);
    const entity = this.repo.create({ ...dto, project_no });
    const saved: Project = await (this.repo.save(entity) as any);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');

    const { company, client, created_at, updated_at, id: _id, project_no, ...updateData } = dto;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('工程項目不存在');
    await this.repo.update(id, { status });
    return this.findOne(id);
  }
}
