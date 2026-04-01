import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_OPTIONS: Record<string, string[]> = {
  employee_role: ['司機', '機手', '雜工', '管理', '鴻輝代工', '散工機手', '管工', '安全督導員', '董事', 'T1'],
  machine_type: ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車', '挖掘機', '火轆'],
  tonnage: ['3噸', '5.5噸', '8噸', '10噸', '11噸', '13噸', '14噸', '20噸', '24噸', '30噸', '33噸', '35噸', '38噸', '44噸', '49噸'],
  wage_unit: ['小時', '車', '天', '周', '月', '噸', 'M', 'M2', 'M3', 'JOB', '工', '次', '轉', 'trip', '晚'],
  service_type: ['運輸', '代工', '工程', '機械', '管工工作', '維修保養', '雜務', '上堂', '緊急情況', '請假/休息'],
  day_night: ['日', '夜', '中直'],
  vehicle_type: ['泥頭車', '夾車', '勾斗車', '吊車', '拖架', '拖頭', '輕型貨車', '領航車'],
};

@Injectable()
export class FieldOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async seedDefaults() {
    const count = await this.prisma.fieldOption.count();
    if (count === 0) {
      // First time: seed all categories
      const data: any[] = [];
      for (const [category, labels] of Object.entries(DEFAULT_OPTIONS)) {
        labels.forEach((label, idx) => {
          data.push({ category, label, sort_order: idx + 1, is_active: true });
        });
      }
      await this.prisma.fieldOption.createMany({ data });
      console.log(`Seeded ${data.length} field options`);
      return;
    }

    // Seed any new categories that don't exist yet
    for (const [category, labels] of Object.entries(DEFAULT_OPTIONS)) {
      const existing = await this.prisma.fieldOption.count({ where: { category } });
      if (existing === 0) {
        const data = labels.map((label, idx) => ({
          category, label, sort_order: idx + 1, is_active: true,
        }));
        await this.prisma.fieldOption.createMany({ data });
        console.log(`Seeded ${data.length} field options for new category: ${category}`);
      }
    }
  }

  async findByCategory(category: string) {
    return this.prisma.fieldOption.findMany({
      where: { category },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  async findAllGrouped() {
    const all = await this.prisma.fieldOption.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const grouped: Record<string, any[]> = {};
    for (const opt of all) {
      if (!grouped[opt.category]) grouped[opt.category] = [];
      grouped[opt.category].push(opt);
    }
    return grouped;
  }

  async create(dto: { category: string; label: string; sort_order?: number }) {
    if (!dto.sort_order) {
      const max = await this.prisma.fieldOption.aggregate({
        where: { category: dto.category },
        _max: { sort_order: true },
      });
      dto.sort_order = (max._max.sort_order || 0) + 1;
    }
    return this.prisma.fieldOption.create({ data: dto as any });
  }

  async update(id: number, dto: { label?: string; sort_order?: number; is_active?: boolean }) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    return this.prisma.fieldOption.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    await this.prisma.fieldOption.delete({ where: { id } });
    return { success: true };
  }

  async reorder(category: string, orderedIds: number[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.prisma.fieldOption.update({
        where: { id: orderedIds[i] },
        data: { sort_order: i + 1 },
      });
    }
    return this.findByCategory(category);
  }
}
