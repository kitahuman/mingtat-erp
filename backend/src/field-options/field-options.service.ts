import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_OPTIONS: Record<string, string[]> = {
  employee_role: ['管理', '司機', '機手', '雜工', '鴻輝代工', '散工機手', '管工', '安全督導員', '董事', 'T1'],
  machine_type: ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車', '挖掘機', '火轆'],
  tonnage: ['3噸', '5.5噸', '8噸', '10噸', '11噸', '13噸', '14噸', '20噸', '24噸', '30噸', '33噸', '35噸', '38噸', '44噸', '49噸'],
  wage_unit: ['小時', '車', '天', '周', '月', '噸', 'M', 'M2', 'M3', 'JOB', '工', '次', '轉', 'trip', '晚'],
  service_type: ['運輸', '代工', '工程', '機械', '管工工作', '維修保養', '雜務', '上堂', '緊急情況', '請假/休息'],
  day_night: ['日', '夜', '中直'],
  payment_method: ['支票', '現金', '銀行轉帳', 'EPS', 'FPS 轉數快', '信用卡', '網上銀行', '其他'],
  certificate_type: [
    '駕駛執照', '建造業安全訓練證明書（平安卡）', '建造業工人註冊證（工卡）',
    '核准工人證明書', '操作搬土機證明書', '操作挖掘機證明書',
    '起重機操作員證明書', '操作貨車弔機證明書', '操作履帶式固定弔臂起重機證明書',
    '操作輪胎式液壓伸縮弔臂起重機證明書', '機場禁區通行證', '金門證', '禮頓證',
    '密閉空間作業核准工人證明書', '操作壓實機證明書', '弔索銀咭',
    '工藝測試證明書', '壓實負荷物移動機械操作員機證明書', '升降台安全使用訓練證書',
  ],
};

@Injectable()
export class FieldOptionsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

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
    // Check if it already exists in the same category to prevent duplicates
    const existing = await this.prisma.fieldOption.findFirst({
      where: {
        category: dto.category,
        label: dto.label,
      },
    });
    if (existing) return existing;

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
