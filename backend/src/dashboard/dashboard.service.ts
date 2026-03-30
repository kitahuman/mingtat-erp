import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/company.entity';
import { Employee } from '../employees/employee.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(Employee) private employeeRepo: Repository<Employee>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Machinery) private machineryRepo: Repository<Machinery>,
  ) {}

  async getStats() {
    const [companies, employees, vehicles, machinery] = await Promise.all([
      this.companyRepo.count({ where: { status: 'active' } }),
      this.employeeRepo.count({ where: { status: 'active' } }),
      this.vehicleRepo.count({ where: { status: 'active' } }),
      this.machineryRepo.count({ where: { status: 'active' } }),
    ]);

    // Expiring licenses in 30 days
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const dateStr = thirtyDaysLater.toISOString().split('T')[0];

    const expiringEmployees = await this.employeeRepo.createQueryBuilder('e')
      .where('e.status = :s', { s: 'active' })
      .andWhere('(e.green_card_expiry <= :d OR e.construction_card_expiry <= :d OR e.driving_license_expiry <= :d)', { d: dateStr })
      .getCount();

    const expiringVehicles = await this.vehicleRepo.createQueryBuilder('v')
      .where('v.status = :s', { s: 'active' })
      .andWhere('(v.insurance_expiry <= :d OR v.inspection_date <= :d OR v.license_expiry <= :d)', { d: dateStr })
      .getCount();

    const expiringMachinery = await this.machineryRepo.createQueryBuilder('m')
      .where('m.status = :s', { s: 'active' })
      .andWhere('m.inspection_cert_expiry <= :d', { d: dateStr })
      .getCount();

    // Company breakdown
    const companyBreakdown = await this.companyRepo.createQueryBuilder('c')
      .select('c.company_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('c.status = :s', { s: 'active' })
      .groupBy('c.company_type')
      .getRawMany();

    // Employee role breakdown
    const roleBreakdown = await this.employeeRepo.createQueryBuilder('e')
      .select('e.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('e.status = :s', { s: 'active' })
      .groupBy('e.role')
      .getRawMany();

    return {
      companies,
      employees,
      vehicles,
      machinery,
      expiringEmployees,
      expiringVehicles,
      expiringMachinery,
      companyBreakdown,
      roleBreakdown,
    };
  }
}
