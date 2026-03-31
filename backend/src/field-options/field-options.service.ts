import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldOption } from './field-option.entity';

const DEFAULT_OPTIONS: Record<string, string[]> = {
  machine_type: ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車', '挖掘機', '火轆'],
  tonnage: ['3噸', '5.5噸', '8噸', '10噸', '11噸', '13噸', '14噸', '20噸', '24噸', '30噸', '33噸', '35噸', '38噸', '44噸', '49噸'],
  wage_unit: ['小時', '車', '天', '周', '月', '噸', 'M', 'M2', 'M3', 'JOB', '工', '次', '轉', 'trip', '晚'],
  service_type: ['運輸', '代工', '工程', '機械', '管工工作', '維修保養', '雜務', '上堂', '緊急情況', '請假/休息'],
  day_night: ['日', '夜', '中直'],
};

@Injectable()
export class FieldOptionsService {
  constructor(
    @InjectRepository(FieldOption) private repo: Repository<FieldOption>,
  ) {}

  async seedDefaults() {
    const count = await this.repo.count();
    if (count > 0) return; // Already seeded

    const entities: Partial<FieldOption>[] = [];
    for (const [category, labels] of Object.entries(DEFAULT_OPTIONS)) {
      labels.forEach((label, idx) => {
        entities.push({ category, label, sort_order: idx + 1, is_active: true });
      });
    }
    await this.repo.save(entities);
    console.log(`Seeded ${entities.length} field options`);
  }

  async findByCategory(category: string) {
    return this.repo.find({
      where: { category },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async findAllGrouped() {
    const all = await this.repo.find({ order: { sort_order: 'ASC', id: 'ASC' } });
    const grouped: Record<string, FieldOption[]> = {};
    for (const opt of all) {
      if (!grouped[opt.category]) grouped[opt.category] = [];
      grouped[opt.category].push(opt);
    }
    return grouped;
  }

  async create(dto: { category: string; label: string; sort_order?: number }) {
    // Get max sort_order for category
    if (!dto.sort_order) {
      const max = await this.repo
        .createQueryBuilder('fo')
        .select('MAX(fo.sort_order)', 'max')
        .where('fo.category = :cat', { cat: dto.category })
        .getRawOne();
      dto.sort_order = (max?.max || 0) + 1;
    }
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: { label?: string; sort_order?: number; is_active?: boolean }) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    Object.assign(existing, dto);
    return this.repo.save(existing);
  }

  async remove(id: number) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    await this.repo.remove(existing);
    return { success: true };
  }

  async reorder(category: string, orderedIds: number[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.repo.update(orderedIds[i], { sort_order: i + 1 });
    }
    return this.findByCategory(category);
  }
}
