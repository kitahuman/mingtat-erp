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

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenStr = sevenDaysLater.toISOString().split('T')[0];
    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    // Detailed expiry items for employees
    const expiringEmployeeItems = await this.employeeRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.company', 'c')
      .where('e.status = :s', { s: 'active' })
      .andWhere('(e.green_card_expiry <= :d OR e.construction_card_expiry <= :d OR e.driving_license_expiry <= :d)', { d: sixtyStr })
      .orderBy('LEAST(COALESCE(e.green_card_expiry, \'2099-12-31\'), COALESCE(e.construction_card_expiry, \'2099-12-31\'), COALESCE(e.driving_license_expiry, \'2099-12-31\'))', 'ASC')
      .take(50)
      .getMany();

    // Detailed expiry items for vehicles
    const expiringVehicleItems = await this.vehicleRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.owner_company', 'c')
      .where('v.status = :s', { s: 'active' })
      .andWhere('(v.insurance_expiry <= :d OR v.permit_fee_expiry <= :d OR v.inspection_date <= :d OR v.license_expiry <= :d)', { d: sixtyStr })
      .orderBy('LEAST(COALESCE(v.insurance_expiry, \'2099-12-31\'), COALESCE(v.permit_fee_expiry, \'2099-12-31\'), COALESCE(v.inspection_date, \'2099-12-31\'), COALESCE(v.license_expiry, \'2099-12-31\'))', 'ASC')
      .take(50)
      .getMany();

    // Detailed expiry items for machinery
    const expiringMachineryItems = await this.machineryRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.owner_company', 'c')
      .where('m.status = :s', { s: 'active' })
      .andWhere('(m.inspection_cert_expiry <= :d OR m.insurance_expiry <= :d)', { d: sixtyStr })
      .orderBy('LEAST(COALESCE(m.inspection_cert_expiry, \'2099-12-31\'), COALESCE(m.insurance_expiry, \'2099-12-31\'))', 'ASC')
      .take(50)
      .getMany();

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
      expiringEmployeeItems,
      expiringVehicleItems,
      expiringMachineryItems,
      companyBreakdown,
      roleBreakdown,
    };
  }
}
