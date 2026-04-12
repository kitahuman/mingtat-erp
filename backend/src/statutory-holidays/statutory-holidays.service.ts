import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatutoryHolidaysService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { year?: number }) {
    const where: any = {};
    if (query.year) {
      const startDate = new Date(`${query.year}-01-01`);
      const endDate = new Date(`${query.year}-12-31`);
      where.date = { gte: startDate, lte: endDate };
    }

    const data = await this.prisma.statutoryHoliday.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    return { data };
  }

  async findOne(id: number) {
    const holiday = await this.prisma.statutoryHoliday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('法定假期不存在');
    return holiday;
  }

  async create(dto: { date: string; name: string }) {
    if (!dto.date || !dto.name) throw new BadRequestException('日期和名稱為必填');
    const existing = await this.prisma.statutoryHoliday.findUnique({
      where: { date: new Date(dto.date) },
    });
    if (existing) throw new BadRequestException(`${dto.date} 已有法定假期記錄`);

    return this.prisma.statutoryHoliday.create({
      data: {
        date: new Date(dto.date),
        name: dto.name,
      },
    });
  }

  async update(id: number, dto: { date?: string; name?: string }) {
    const existing = await this.prisma.statutoryHoliday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('法定假期不存在');

    const updateData: any = {};
    if (dto.date) updateData.date = new Date(dto.date);
    if (dto.name) updateData.name = dto.name;

    return this.prisma.statutoryHoliday.update({ where: { id }, data: updateData });
  }

  async remove(id: number) {
    const existing = await this.prisma.statutoryHoliday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('法定假期不存在');
    await this.prisma.statutoryHoliday.delete({ where: { id } });
    return { message: '刪除成功' };
  }

  async bulkCreate(items: { date: string; name: string }[]) {
    if (!items || items.length === 0) throw new BadRequestException('請提供至少一個假期');

    const results: any[] = [];
    const errors: string[] = [];

    for (const item of items) {
      try {
        const existing = await this.prisma.statutoryHoliday.findUnique({
          where: { date: new Date(item.date) },
        });
        if (existing) {
          errors.push(`${item.date} (${item.name}) 已存在，跳過`);
          continue;
        }
        const created = await this.prisma.statutoryHoliday.create({
          data: { date: new Date(item.date), name: item.name },
        });
        results.push(created);
      } catch (err: any) {
        errors.push(`${item.date} (${item.name}): ${err.message}`);
      }
    }

    return { created: results.length, errors, data: results };
  }

  /**
   * Find holidays within a date range
   */
  async findByDateRange(dateFrom: string, dateTo: string) {
    return this.prisma.statutoryHoliday.findMany({
      where: {
        date: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo),
        },
      },
      orderBy: { date: 'asc' },
    });
  }
}
