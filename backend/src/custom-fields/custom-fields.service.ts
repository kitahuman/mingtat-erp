import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomField } from './custom-field.entity';
import { CustomFieldValue } from './custom-field-value.entity';

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomField) private fieldRepo: Repository<CustomField>,
    @InjectRepository(CustomFieldValue) private valueRepo: Repository<CustomFieldValue>,
  ) {}

  // ========== Custom Field CRUD ==========

  async findFields(query: { module?: string }) {
    const qb = this.fieldRepo.createQueryBuilder('cf');
    if (query.module) {
      qb.andWhere('cf.module = :m', { m: query.module });
    }
    qb.orderBy('cf.module', 'ASC').addOrderBy('cf.sort_order', 'ASC').addOrderBy('cf.id', 'ASC');
    return qb.getMany();
  }

  async findOneField(id: number) {
    const field = await this.fieldRepo.findOne({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    return field;
  }

  async createField(dto: Partial<CustomField>) {
    const entity = this.fieldRepo.create(dto);
    return this.fieldRepo.save(entity);
  }

  async updateField(id: number, dto: Partial<CustomField>) {
    const field = await this.fieldRepo.findOne({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    const { created_at, updated_at, id: _id, ...updateData } = dto as any;
    await this.fieldRepo.update(id, updateData);
    return this.fieldRepo.findOne({ where: { id } });
  }

  async deleteField(id: number) {
    const field = await this.fieldRepo.findOne({ where: { id } });
    if (!field) throw new NotFoundException('自定義欄位不存在');
    // Delete all values for this field
    await this.valueRepo.delete({ custom_field_id: id });
    await this.fieldRepo.delete(id);
    return { deleted: true };
  }

  // ========== Custom Field Value CRUD ==========

  async findValues(query: { module?: string; entityId?: number; customFieldId?: number }) {
    const qb = this.valueRepo.createQueryBuilder('cfv')
      .leftJoinAndSelect('cfv.custom_field', 'cf');
    if (query.module) {
      qb.andWhere('cfv.module = :m', { m: query.module });
    }
    if (query.entityId) {
      qb.andWhere('cfv.entity_id = :eid', { eid: query.entityId });
    }
    if (query.customFieldId) {
      qb.andWhere('cfv.custom_field_id = :cfid', { cfid: query.customFieldId });
    }
    qb.orderBy('cf.sort_order', 'ASC').addOrderBy('cf.id', 'ASC');
    return qb.getMany();
  }

  async batchUpdateValues(data: {
    module: string;
    entityId: number;
    values: { customFieldId: number; value: string }[];
  }) {
    const results: CustomFieldValue[] = [];

    for (const item of data.values) {
      let existing = await this.valueRepo.findOne({
        where: {
          custom_field_id: item.customFieldId,
          entity_id: data.entityId,
          module: data.module,
        },
      });

      if (existing) {
        existing.value = item.value;
        results.push(await this.valueRepo.save(existing));
      } else {
        const newVal = this.valueRepo.create({
          custom_field_id: item.customFieldId,
          entity_id: data.entityId,
          module: data.module,
          value: item.value,
        });
        results.push(await this.valueRepo.save(newVal));
      }
    }

    return results;
  }

  // ========== Expiry Alerts for Custom Fields ==========

  async getExpiryAlerts() {
    // Find all date fields with expiry alert enabled
    const alertFields = await this.fieldRepo.find({
      where: { field_type: 'date', has_expiry_alert: true, is_active: true },
    });

    if (alertFields.length === 0) return [];

    const sixtyDaysLater = new Date();
    sixtyDaysLater.setDate(sixtyDaysLater.getDate() + 60);
    const sixtyStr = sixtyDaysLater.toISOString().split('T')[0];

    const alerts: any[] = [];

    for (const field of alertFields) {
      const values = await this.valueRepo.find({
        where: { custom_field_id: field.id },
      });

      for (const val of values) {
        if (val.value && val.value <= sixtyStr) {
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
