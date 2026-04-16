import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EquipmentProfitSummary,
  EquipmentProfitDetail,
  WorkLogDetail,
  ExpenseDetail,
} from './dto/equipment-profit.dto';

@Injectable()
export class EquipmentProfitService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: unknown): number {
    return Number(v) || 0;
  }

  private round2(n: number): number {
    return parseFloat(n.toFixed(2));
  }

  // ═══════════════════════════════════════════════════════════
  // GET /equipment-profit/report
  // ═══════════════════════════════════════════════════════════
  async getReport(params: {
    date_from?: string;
    date_to?: string;
    equipment_type?: string;
    equipment_id?: number;
  }): Promise<{ data: EquipmentProfitSummary[] }> {
    const { date_from, date_to, equipment_type, equipment_id } = params;

    // Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (date_from) dateFilter.gte = new Date(date_from);
    if (date_to) dateFilter.lte = new Date(date_to + 'T23:59:59.999Z');

    const results: EquipmentProfitSummary[] = [];

    // ─── Machinery ─────────────────────────────────────────
    if (!equipment_type || equipment_type === 'machinery') {
      const machineryWhere: Record<string, unknown> = { deleted_at: null };
      if (equipment_type === 'machinery' && equipment_id) {
        machineryWhere.id = equipment_id;
      }

      const machineryList = await this.prisma.machinery.findMany({
        where: machineryWhere,
        include: { owner_company: true },
      });

      for (const m of machineryList) {
        const setting = await this.getOrCreateSetting('machinery', m.id);
        const commission = this.toNum(setting.equipment_profit_commission_percentage);

        // Revenue from work_logs
        const workLogWhere: Record<string, unknown> = {
          work_log_machinery_id: m.id,
          deleted_at: null,
        };
        if (dateFilter.gte || dateFilter.lte) {
          workLogWhere.scheduled_date = dateFilter;
        }

        const workLogs = await this.prisma.workLog.findMany({
          where: workLogWhere,
          select: {
            matched_rate: true,
            quantity: true,
            matched_ot_rate: true,
            ot_quantity: true,
          },
        });

        const grossRevenue = this.calcGrossRevenue(workLogs);
        const companyRevenue = this.round2(grossRevenue * (commission / 100));

        // Expenses
        const expenseWhere: Record<string, unknown> = {
          machinery_id: m.id,
          deleted_at: null,
        };
        if (dateFilter.gte || dateFilter.lte) {
          expenseWhere.date = dateFilter;
        }

        const expenseAgg = await this.prisma.expense.aggregate({
          where: expenseWhere,
          _sum: { total_amount: true },
        });
        const totalExpense = this.toNum(expenseAgg._sum.total_amount);

        results.push({
          equipment_type: 'machinery',
          equipment_id: m.id,
          equipment_code: m.machine_code,
          machine_type: m.machine_type,
          tonnage: m.tonnage ? this.toNum(m.tonnage) : null,
          gross_revenue: this.round2(grossRevenue),
          commission_percentage: commission,
          company_revenue: companyRevenue,
          total_expense: this.round2(totalExpense),
          profit_loss: this.round2(companyRevenue - totalExpense),
        });
      }
    }

    // ─── Vehicles ──────────────────────────────────────────
    if (!equipment_type || equipment_type === 'vehicle') {
      const vehicleWhere: Record<string, unknown> = { deleted_at: null };
      if (equipment_type === 'vehicle' && equipment_id) {
        vehicleWhere.id = equipment_id;
      }

      const vehicleList = await this.prisma.vehicle.findMany({
        where: vehicleWhere,
        include: { owner_company: true },
      });

      for (const v of vehicleList) {
        const setting = await this.getOrCreateSetting('vehicle', v.id);
        const commission = this.toNum(setting.equipment_profit_commission_percentage);

        // Revenue from work_logs
        const workLogWhere: Record<string, unknown> = {
          work_log_vehicle_id: v.id,
          deleted_at: null,
        };
        if (dateFilter.gte || dateFilter.lte) {
          workLogWhere.scheduled_date = dateFilter;
        }

        const workLogs = await this.prisma.workLog.findMany({
          where: workLogWhere,
          select: {
            matched_rate: true,
            quantity: true,
            matched_ot_rate: true,
            ot_quantity: true,
          },
        });

        const grossRevenue = this.calcGrossRevenue(workLogs);
        const companyRevenue = this.round2(grossRevenue * (commission / 100));

        // Expenses
        const expenseWhere: Record<string, unknown> = {
          vehicle_id: v.id,
          deleted_at: null,
        };
        if (dateFilter.gte || dateFilter.lte) {
          expenseWhere.date = dateFilter;
        }

        const expenseAgg = await this.prisma.expense.aggregate({
          where: expenseWhere,
          _sum: { total_amount: true },
        });
        const totalExpense = this.toNum(expenseAgg._sum.total_amount);

        results.push({
          equipment_type: 'vehicle',
          equipment_id: v.id,
          equipment_code: v.plate_number,
          machine_type: v.machine_type,
          tonnage: v.tonnage ? this.toNum(v.tonnage) : null,
          gross_revenue: this.round2(grossRevenue),
          commission_percentage: commission,
          company_revenue: companyRevenue,
          total_expense: this.round2(totalExpense),
          profit_loss: this.round2(companyRevenue - totalExpense),
        });
      }
    }

    return { data: results };
  }

  // ═══════════════════════════════════════════════════════════
  // GET /equipment-profit/report/:type/:id/details
  // ═══════════════════════════════════════════════════════════
  async getDetails(
    equipmentType: string,
    equipmentId: number,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ data: EquipmentProfitDetail }> {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59.999Z');

    const setting = await this.getOrCreateSetting(equipmentType, equipmentId);
    const commission = this.toNum(setting.equipment_profit_commission_percentage);

    if (equipmentType === 'machinery') {
      const machinery = await this.prisma.machinery.findUnique({
        where: { id: equipmentId },
        include: { owner_company: true },
      });
      if (!machinery) throw new Error('Machinery not found');

      const { workLogDetails, expenseDetails, grossRevenue, totalExpense } =
        await this.fetchEquipmentDetails(
          'machinery',
          equipmentId,
          dateFilter,
        );

      const companyRevenue = this.round2(grossRevenue * (commission / 100));

      return {
        data: {
          equipment_type: 'machinery',
          equipment_id: machinery.id,
          equipment_code: machinery.machine_code,
          machine_type: machinery.machine_type,
          tonnage: machinery.tonnage ? this.toNum(machinery.tonnage) : null,
          brand: machinery.brand,
          model: machinery.model,
          status: machinery.status,
          owner_company: machinery.owner_company?.name ?? null,
          commission_percentage: commission,
          gross_revenue: this.round2(grossRevenue),
          company_revenue: companyRevenue,
          total_expense: this.round2(totalExpense),
          profit_loss: this.round2(companyRevenue - totalExpense),
          work_logs: workLogDetails,
          expenses: expenseDetails,
        },
      };
    }

    // Vehicle
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: equipmentId },
      include: { owner_company: true },
    });
    if (!vehicle) throw new Error('Vehicle not found');

    const { workLogDetails, expenseDetails, grossRevenue, totalExpense } =
      await this.fetchEquipmentDetails('vehicle', equipmentId, dateFilter);

    const companyRevenue = this.round2(grossRevenue * (commission / 100));

    return {
      data: {
        equipment_type: 'vehicle',
        equipment_id: vehicle.id,
        equipment_code: vehicle.plate_number,
        machine_type: vehicle.machine_type,
        tonnage: vehicle.tonnage ? this.toNum(vehicle.tonnage) : null,
        brand: vehicle.brand,
        model: vehicle.model,
        status: vehicle.status,
        owner_company: vehicle.owner_company?.name ?? null,
        commission_percentage: commission,
        gross_revenue: this.round2(grossRevenue),
        company_revenue: companyRevenue,
        total_expense: this.round2(totalExpense),
        profit_loss: this.round2(companyRevenue - totalExpense),
        work_logs: workLogDetails,
        expenses: expenseDetails,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // GET /equipment-profit/settings
  // ═══════════════════════════════════════════════════════════
  async getSettings() {
    const settings = await this.prisma.equipmentProfitSetting.findMany({
      orderBy: [
        { equipment_profit_equipment_type: 'asc' },
        { equipment_profit_equipment_id: 'asc' },
      ],
    });
    return { data: settings };
  }

  // ═══════════════════════════════════════════════════════════
  // PUT /equipment-profit/settings/:equipmentType/:equipmentId
  // ═══════════════════════════════════════════════════════════
  async updateCommission(
    equipmentType: string,
    equipmentId: number,
    commissionPercentage: number,
  ) {
    const setting = await this.prisma.equipmentProfitSetting.upsert({
      where: {
        equipment_profit_equipment_type_equipment_profit_equipment_id: {
          equipment_profit_equipment_type: equipmentType,
          equipment_profit_equipment_id: equipmentId,
        },
      },
      update: {
        equipment_profit_commission_percentage: commissionPercentage,
      },
      create: {
        equipment_profit_equipment_type: equipmentType,
        equipment_profit_equipment_id: equipmentId,
        equipment_profit_commission_percentage: commissionPercentage,
      },
    });
    return { data: setting };
  }

  // ═══════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════

  private calcGrossRevenue(
    workLogs: {
      matched_rate: unknown;
      quantity: unknown;
      matched_ot_rate: unknown;
      ot_quantity: unknown;
    }[],
  ): number {
    let total = 0;
    for (const wl of workLogs) {
      const rate = this.toNum(wl.matched_rate);
      const qty = this.toNum(wl.quantity);
      const otRate = this.toNum(wl.matched_ot_rate);
      const otQty = this.toNum(wl.ot_quantity);
      total += rate * qty + otRate * otQty;
    }
    return total;
  }

  private async getOrCreateSetting(equipmentType: string, equipmentId: number) {
    let setting = await this.prisma.equipmentProfitSetting.findUnique({
      where: {
        equipment_profit_equipment_type_equipment_profit_equipment_id: {
          equipment_profit_equipment_type: equipmentType,
          equipment_profit_equipment_id: equipmentId,
        },
      },
    });

    if (!setting) {
      setting = await this.prisma.equipmentProfitSetting.create({
        data: {
          equipment_profit_equipment_type: equipmentType,
          equipment_profit_equipment_id: equipmentId,
          equipment_profit_commission_percentage: 100,
        },
      });
    }

    return setting;
  }

  private async fetchEquipmentDetails(
    equipmentType: string,
    equipmentId: number,
    dateFilter: { gte?: Date; lte?: Date },
  ): Promise<{
    workLogDetails: WorkLogDetail[];
    expenseDetails: ExpenseDetail[];
    grossRevenue: number;
    totalExpense: number;
  }> {
    // Work logs
    const workLogWhere: Record<string, unknown> = {
      deleted_at: null,
    };
    if (equipmentType === 'machinery') {
      workLogWhere.work_log_machinery_id = equipmentId;
    } else {
      workLogWhere.work_log_vehicle_id = equipmentId;
    }
    if (dateFilter.gte || dateFilter.lte) {
      workLogWhere.scheduled_date = dateFilter;
    }

    const workLogs = await this.prisma.workLog.findMany({
      where: workLogWhere,
      include: {
        client: { select: { name: true } },
        employee: { select: { name_zh: true } },
      },
      orderBy: { scheduled_date: 'desc' },
    });

    let grossRevenue = 0;
    const workLogDetails: WorkLogDetail[] = workLogs.map((wl) => {
      const rate = this.toNum(wl.matched_rate);
      const qty = this.toNum(wl.quantity);
      const otRate = this.toNum(wl.matched_ot_rate);
      const otQty = this.toNum(wl.ot_quantity);
      const lineAmount = rate * qty + otRate * otQty;
      grossRevenue += lineAmount;

      return {
        id: wl.id,
        scheduled_date: wl.scheduled_date
          ? wl.scheduled_date.toISOString().split('T')[0]
          : null,
        service_type: wl.service_type,
        machine_type: wl.machine_type,
        equipment_number: wl.equipment_number,
        day_night: wl.day_night,
        start_location: wl.start_location,
        end_location: wl.end_location,
        quantity: wl.quantity ? this.toNum(wl.quantity) : null,
        unit: wl.unit,
        ot_quantity: wl.ot_quantity ? this.toNum(wl.ot_quantity) : null,
        ot_unit: wl.ot_unit,
        matched_rate: wl.matched_rate ? this.toNum(wl.matched_rate) : null,
        matched_ot_rate: wl.matched_ot_rate
          ? this.toNum(wl.matched_ot_rate)
          : null,
        line_amount: this.round2(lineAmount),
        client_name: wl.client?.name ?? null,
        employee_name: wl.employee?.name_zh ?? null,
      };
    });

    // Expenses
    const expenseWhere: Record<string, unknown> = {
      deleted_at: null,
    };
    if (equipmentType === 'machinery') {
      expenseWhere.machinery_id = equipmentId;
    } else {
      expenseWhere.vehicle_id = equipmentId;
    }
    if (dateFilter.gte || dateFilter.lte) {
      expenseWhere.date = dateFilter;
    }

    const expenses = await this.prisma.expense.findMany({
      where: expenseWhere,
      include: {
        category: { select: { name: true } },
        supplier: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
    });

    let totalExpense = 0;
    const expenseDetails: ExpenseDetail[] = expenses.map((exp) => {
      const amount = this.toNum(exp.total_amount);
      totalExpense += amount;
      return {
        id: exp.id,
        date: exp.date.toISOString().split('T')[0],
        item: exp.item,
        category_name: exp.category?.name ?? null,
        supplier_name: exp.supplier?.name ?? exp.supplier_name ?? null,
        total_amount: this.round2(amount),
        remarks: exp.remarks,
      };
    });

    return {
      workLogDetails,
      expenseDetails,
      grossRevenue: this.round2(grossRevenue),
      totalExpense: this.round2(totalExpense),
    };
  }
}
