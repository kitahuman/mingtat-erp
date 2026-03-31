import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
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

    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    // Employee expiry alerts - use raw query to avoid TypeORM alias issues
    const employeeAlerts: any[] = [];
    const activeEmployees = await this.employeeRepo.find({
      where: { status: 'active' as any },
      relations: ['company'],
    });
    for (const e of activeEmployees) {
      const checks = [
        { type: '平安卡', date: e.green_card_expiry },
        { type: '建造業工人註冊證', date: e.construction_card_expiry },
        { type: '駕駛執照', date: e.driving_license_expiry },
      ];
      for (const c of checks) {
        if (c.date && c.date <= sixtyStr) {
          employeeAlerts.push({
            id: e.id,
            name: e.name_zh,
            type: c.type,
            expiry_date: c.date,
            company_name: e.company?.name || '',
          });
        }
      }
    }
    employeeAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    // Vehicle expiry alerts
    const vehicleAlerts: any[] = [];
    const activeVehicles = await this.vehicleRepo.find({
      where: { status: 'active' as any },
      relations: ['owner_company'],
    });
    for (const v of activeVehicles) {
      const checks = [
        { type: '保險', date: v.insurance_expiry },
        { type: '牌費', date: v.permit_fee_expiry },
        { type: '驗車', date: v.inspection_date },
        { type: '行車證', date: v.license_expiry },
      ];
      for (const c of checks) {
        if (c.date && c.date <= sixtyStr) {
          vehicleAlerts.push({
            id: v.id,
            name: v.plate_number,
            type: c.type,
            expiry_date: c.date,
            company_name: v.owner_company?.name || '',
          });
        }
      }
    }
    vehicleAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

    // Machinery expiry alerts
    const machineryAlerts: any[] = [];
    const activeMachinery = await this.machineryRepo.find({
      where: { status: 'active' as any },
      relations: ['owner_company'],
    });
    for (const m of activeMachinery) {
      const checks = [
        { type: '驗機紙', date: m.inspection_cert_expiry },
        { type: '保險', date: m.insurance_expiry },
      ];
      for (const c of checks) {
        if (c.date && c.date <= sixtyStr) {
          machineryAlerts.push({
            id: m.id,
            name: m.machine_code,
            type: c.type,
            expiry_date: c.date,
            company_name: m.owner_company?.name || '',
          });
        }
      }
    }
    machineryAlerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));

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
      expiryAlerts: {
        employees: employeeAlerts,
        vehicles: vehicleAlerts,
        machinery: machineryAlerts,
      },
      roleBreakdown,
    };
  }
}
