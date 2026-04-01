import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyProfilesService } from '../company-profiles/company-profiles.service';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private companyProfilesService: CompanyProfilesService,
    private customFieldsService: CustomFieldsService,
  ) {}

  async getStats() {
    const [companies, employees, vehicles, machinery, companyProfiles] = await Promise.all([
      this.prisma.company.count({ where: { status: 'active' } }),
      this.prisma.employee.count({ where: { status: 'active' } }),
      this.prisma.vehicle.count({ where: { status: 'active' } }),
      this.prisma.machinery.count({ where: { status: 'active' } }),
      this.prisma.companyProfile.count({ where: { status: 'active' } }),
    ]);

    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    // Employee expiry alerts
    const employeeAlerts: any[] = [];
    const activeEmployees = await this.prisma.employee.findMany({
      where: { status: 'active' },
      include: { company: true },
    });
    for (const e of activeEmployees) {
      const checks = [
        { type: '平安卡', date: e.green_card_expiry },
        { type: '建造業工人註冊證', date: e.construction_card_expiry },
        { type: '駕駛執照', date: e.driving_license_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
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
    const activeVehicles = await this.prisma.vehicle.findMany({
      where: { status: 'active' },
      include: { owner_company: true },
    });
    for (const v of activeVehicles) {
      const checks = [
        { type: '保險', date: v.insurance_expiry },
        { type: '牌費', date: v.permit_fee_expiry },
        { type: '驗車', date: v.inspection_date },
        { type: '行車證', date: v.license_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
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
    const activeMachinery = await this.prisma.machinery.findMany({
      where: { status: 'active' },
      include: { owner_company: true },
    });
    for (const m of activeMachinery) {
      const checks = [
        { type: '驗機紙', date: m.inspection_cert_expiry },
        { type: '保險', date: m.insurance_expiry },
      ];
      for (const c of checks) {
        if (c.date && String(c.date) <= sixtyStr) {
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

    // Company profile expiry alerts
    const companyProfileAlerts = await this.companyProfilesService.getExpiryAlerts();

    // Custom field expiry alerts
    const customFieldAlerts = await this.customFieldsService.getExpiryAlerts();

    // Employee role breakdown using raw query
    const roleBreakdown = await this.prisma.$queryRaw`
      SELECT role, COUNT(*)::int as count
      FROM employees
      WHERE status = 'active'
      GROUP BY role
    `;

    return {
      companies,
      employees,
      vehicles,
      machinery,
      companyProfiles,
      expiryAlerts: {
        employees: employeeAlerts,
        vehicles: vehicleAlerts,
        machinery: machineryAlerts,
        companyProfiles: companyProfileAlerts,
        customFields: customFieldAlerts,
      },
      roleBreakdown,
    };
  }
}
