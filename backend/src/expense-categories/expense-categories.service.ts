import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  '工程支出': ['分判商工程費', '工程用材料費', '工程用租金', '工程用機械租金', '倉務雜費', '其他工程支出', '代支工程款'],
  '出糧支出': ['出糧支出-文員', '出糧支出-管工', '出糧支出-司機', '出糧支出-雜工', '出糧支出-機手', '出糧支出-散工司機', '出糧支出-散工機手', '員工強積金', '代支出糧', '代支費用', '遣散費', '賠償', '勞保'],
  '車輛支出': ['牌費', '油費', '維修費', '驗車費', '汽車零件', '車輛用其他費用', '車輛保險費', '買車', '供車會', '其他車隊租金', '汽車費用-GPS', '運輸費用'],
  '機械支出': ['供機械會', '驗機費', '機械維修零件', '機械採購'],
  '行政支出': ['辦公室用雜費', '辦公室用租金', '膳食', '行政費', '電腦及軟件費用', '裝修費', '應酬費', '報稅核數費及周年申報表申報費', '律師費', '供樓'],
  '其他支出': ['買賣產品收入', '入帳票支出', '其他支出', '股東往來', '貸款還款', '利得稅', '罰款'],
};

@Injectable()
export class ExpenseCategoriesService {
  constructor(private prisma: PrismaService) {}

  /** Seed default categories if none exist */
  async seedDefaults() {
    const count = await this.prisma.expenseCategory.count();
    if (count > 0) return;

    let parentOrder = 1;
    for (const [parentName, children] of Object.entries(DEFAULT_CATEGORIES)) {
      const parent = await this.prisma.expenseCategory.create({
        data: { name: parentName, sort_order: parentOrder++, is_active: true },
      });
      let childOrder = 1;
      for (const childName of children) {
        await this.prisma.expenseCategory.create({
          data: { name: childName, parent_id: parent.id, sort_order: childOrder++, is_active: true },
        });
      }
    }
    console.log('Seeded default expense categories');
  }

  /** Return all categories as a flat list with parent info */
  async findAll() {
    return this.prisma.expenseCategory.findMany({
      include: { parent: true, children: { orderBy: { sort_order: 'asc' } } },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  /** Return tree structure: top-level categories with their children */
  async findTree() {
    const parents = await this.prisma.expenseCategory.findMany({
      where: { parent_id: null },
      include: {
        children: {
          orderBy: { sort_order: 'asc' },
        },
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return parents;
  }

  async findOne(id: number) {
    const cat = await this.prisma.expenseCategory.findUnique({
      where: { id },
      include: { parent: true, children: { orderBy: { sort_order: 'asc' } } },
    });
    if (!cat) throw new NotFoundException('類別不存在');
    return cat;
  }

  async create(dto: { name: string; parent_id?: number }) {
    const data: any = { name: dto.name, is_active: true };
    if (dto.parent_id) data.parent_id = Number(dto.parent_id);

    // Auto sort_order
    const max = await this.prisma.expenseCategory.aggregate({
      where: { parent_id: data.parent_id || null },
      _max: { sort_order: true },
    });
    data.sort_order = (max._max.sort_order || 0) + 1;

    return this.prisma.expenseCategory.create({ data });
  }

  async update(id: number, dto: { name?: string; is_active?: boolean; sort_order?: number }) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('類別不存在');
    return this.prisma.expenseCategory.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('類別不存在');
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { success: true };
  }

  async reorder(parentId: number | null, orderedIds: number[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.prisma.expenseCategory.update({
        where: { id: orderedIds[i] },
        data: { sort_order: i + 1 },
      });
    }
    return this.findTree();
  }
}
