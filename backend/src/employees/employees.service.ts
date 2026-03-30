import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { EmployeeSalarySetting } from './employee-salary-setting.entity';
import { EmployeeTransfer } from './employee-transfer.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private repo: Repository<Employee>,
    @InjectRepository(EmployeeSalarySetting) private salaryRepo: Repository<EmployeeSalarySetting>,
    @InjectRepository(EmployeeTransfer) private transferRepo: Repository<EmployeeTransfer>,
  ) {}

  async findAll(query: { page?: number; limit?: number; search?: string; role?: string; company_id?: number; status?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.repo.createQueryBuilder('e')
      .leftJoinAndSelect('e.company', 'c');

    if (query.search) {
      qb.andWhere('(e.name_zh ILIKE :s OR e.name_en ILIKE :s OR e.emp_code ILIKE :s OR e.phone ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.role) qb.andWhere('e.role = :role', { role: query.role });
    if (query.company_id) qb.andWhere('e.company_id = :cid', { cid: query.company_id });
    if (query.status) qb.andWhere('e.status = :st', { st: query.status });

    const [data, total] = await qb
      .orderBy('e.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const emp = await this.repo.findOne({
      where: { id },
      relations: ['company', 'salary_settings', 'transfers', 'transfers.from_company', 'transfers.to_company'],
    });
    if (!emp) throw new NotFoundException('員工不存在');
    if (emp.salary_settings) {
      emp.salary_settings.sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    }
    if (emp.transfers) {
      emp.transfers.sort((a, b) => b.transfer_date.localeCompare(a.transfer_date));
    }
    return emp;
  }

  async create(dto: Partial<Employee>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Employee>) {
    const { salary_settings, transfers, company, ...updateData } = dto as any;
    await this.repo.update(id, updateData);
    return this.findOne(id);
  }

  // Salary settings
  async addSalarySetting(employeeId: number, dto: Partial<EmployeeSalarySetting>) {
    const entity = this.salaryRepo.create({ ...dto, employee_id: employeeId });
    return this.salaryRepo.save(entity);
  }

  async getSalarySettings(employeeId: number) {
    return this.salaryRepo.find({
      where: { employee_id: employeeId },
      order: { effective_date: 'DESC' },
    });
  }

  // Transfers
  async transferEmployee(employeeId: number, dto: { from_company_id: number; to_company_id: number; transfer_date: string; notes?: string }) {
    const transfer = this.transferRepo.create({ ...dto, employee_id: employeeId });
    await this.transferRepo.save(transfer);
    await this.repo.update(employeeId, { company_id: dto.to_company_id });
    return this.findOne(employeeId);
  }
}
