import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // ========== Custom Field CRUD ==========

  async findFields(query: { module?: string }) {
    const where: any = {};
    if (query.module) where.module = query.module;

    return this.prisma.customField.findMany({
      where,
      orderBy: [{ module: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  async findOneField(id: number) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    return field;
  }

  async createField(dto: any) {
    return this.prisma.customField.create({ data: dto });
  }

  async updateField(id: number, dto: any) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    const { created_at, updated_at, id: _id, ...updateData } = dto;
    return this.prisma.customField.update({ where: { id }, data: updateData });
  }

  async deleteField(id: number) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    // Delete all values for this field
    await this.prisma.customFieldValue.deleteMany({ where: { custom_field_id: id } });
    await this.prisma.customField.delete({ where: { id } });
    return { deleted: true };
  }

  // ========== Custom Field Value CRUD ==========

  async findValues(query: { module?: string; entityId?: number; customFieldId?: number }) {
    const where: any = {};
    if (query.module) where.module = query.module;
    if (query.entityId) where.entity_id = query.entityId;
    if (query.customFieldId) where.custom_field_id = query.customFieldId;

    return this.prisma.customFieldValue.findMany({
      where,
      include: { custom_field: true },
      orderBy: [{ custom_field: { sort_order: 'asc' } }, { custom_field: { id: 'asc' } }],
    });
  }

  async batchUpdateValues(data: {
    module: string;
    entityId: number;
    values: { customFieldId: number; value: string }[];
  }) {
    const results: any[] = [];

    for (const item of data.values) {
      const existing = await this.prisma.customFieldValue.findFirst({
        where: {
          custom_field_id: item.customFieldId,
          entity_id: data.entityId,
          module: data.module,
        },
      });

      if (existing) {
        const updated = await this.prisma.customFieldValue.update({
          where: { id: existing.id },
          data: { value: item.value },
        });
        results.push(updated);
      } else {
        const created = await this.prisma.customFieldValue.create({
          data: {
            custom_field_id: item.customFieldId,
            entity_id: data.entityId,
            module: data.module,
            value: item.value,
          },
        });
        results.push(created);
      }
    }

    return results;
  }

  // ========== Expiry Alerts for Custom Fields ==========

  async getExpiryAlerts() {
    // Find all date fields with expiry alert enabled
    const alertFields = await this.prisma.customField.findMany({
      where: { field_type: 'date', has_expiry_alert: true, is_active: true },
    });

    if (alertFields.length === 0) return [];

    // 改為 3 個月前提醒 (90 天)
    const ninetyDaysLater = new Date();
    ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);
    const ninetyStr = ninetyDaysLater.toISOString().split('T')[0];

    const alerts: any[] = [];

    for (const field of alertFields) {
      const values = await this.prisma.customFieldValue.findMany({
        where: { custom_field_id: field.id },
      });

      for (const val of values) {
        if (val.value && val.value <= ninetyStr) {
          alerts.push({
            id: val.entity_id,
            name: `#${val.entity_id}`,
            type: field.field_name,
            expiry_date: val.value,
            module: field.module,
            custom_field_id: field.id,
          });
        }
      }
    }

    alerts.sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''));
    return alerts;
  }
}
