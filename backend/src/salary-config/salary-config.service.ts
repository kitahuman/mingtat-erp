import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { Employee } from '../employees/employee.entity';

@Injectable()
export class SalaryConfigService {
  constructor(
    @InjectRepository(EmployeeSalarySetting) private repo: Repository<EmployeeSalarySetting>,
    @InjectRepository(Employee) private empRepo: Repository<Employee>,
  ) {}

  private readonly allowedSortFields = [
    'id', 'employee_id', 'effective_date', 'base_salary', 'salary_type', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    employee_id?: number; salary_type?: string; is_piece_rate?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const qb = this.repo.createQueryBuilder('ss')
      .leftJoinAndSelect('ss.employee', 'employee')
      .leftJoinAndSelect('employee.company', 'company');

    if (query.search) {
      qb.andWhere(
        '(employee.name_zh ILIKE :s OR employee.name_en ILIKE :s OR employee.emp_code ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.employee_id) qb.andWhere('ss.employee_id = :eid', { eid: query.employee_id });
    if (query.salary_type) qb.andWhere('ss.salary_type = :st', { st: query.salary_type });
    if (query.is_piece_rate === 'true') qb.andWhere('ss.is_piece_rate = true');
    if (query.is_piece_rate === 'false') qb.andWhere('ss.is_piece_rate = false');

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'effective_date';
    const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
    qb.orderBy(`ss.${sortBy}`, sortOrder);

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const ss = await this.repo.findOne({
      where: { id },
      relations: ['employee', 'employee.company'],
    });
    if (!ss) throw new NotFoundException('薪酬設定不存在');
    return ss;
  }

  async findByEmployee(employeeId: number) {
    return this.repo.find({
      where: { employee_id: employeeId },
      order: { effective_date: 'DESC' },
    });
  }

  async create(dto: any) {
    // Ensure numeric fields
    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'change_amount',
    ];
    for (const field of numericFields) {
      if (dto[field] !== undefined) {
        dto[field] = Number(dto[field]) || 0;
      }
    }

    const entity = this.repo.create(dto);
    const saved: EmployeeSalarySetting = await (this.repo.save(entity) as any);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');

    const { employee, created_at, id: _id, ...updateData } = dto;

    const numericFields = [
      'base_salary', 'allowance_night', 'allowance_rent', 'allowance_3runway',
      'ot_rate_standard', 'allowance_well', 'allowance_machine', 'allowance_roller',
      'allowance_crane', 'allowance_move_machine', 'allowance_kwh_night',
      'allowance_mid_shift', 'ot_1800_1900', 'ot_1900_2000', 'ot_0600_0700',
      'ot_0700_0800', 'change_amount',
    ];
    for (const field of numericFields) {
      if (updateData[field] !== undefined) {
        updateData[field] = Number(updateData[field]) || 0;
      }
    }

    await this.repo.update(id, updateData);
    return this.findOne(id);
  }

  async delete(id: number) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('薪酬設定不存在');
    await this.repo.delete(id);
    return { deleted: true };
  }
}
