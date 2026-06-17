import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentInSourceTypeDto,
  UpdatePaymentInSourceTypeDto,
} from './dto/payment-in-source-type.dto';

@Injectable()
export class PaymentInSourceTypeService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { is_active: true };
    return this.prisma.paymentInSourceType.findMany({
      where,
      orderBy: { sort_order: 'asc' },
    });
  }

  async findOne(id: number) {
    const record = await this.prisma.paymentInSourceType.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('來源類型不存在');
    return record;
  }

  async create(dto: CreatePaymentInSourceTypeDto) {
    // Check unique code
    const existing = await this.prisma.paymentInSourceType.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`代碼 "${dto.code}" 已存在`);
    }
    return this.prisma.paymentInSourceType.create({
      data: {
        code: dto.code,
        label: dto.label,
        is_system: dto.is_system ?? false,
        has_recalculation: dto.has_recalculation ?? false,
        is_active: dto.is_active ?? true,
        sort_order: dto.sort_order ?? 0,
      },
    });
  }

  async update(id: number, dto: UpdatePaymentInSourceTypeDto) {
    const existing = await this.prisma.paymentInSourceType.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('來源類型不存在');

    // is_system=true: cannot change code
    if (existing.is_system && dto.code && dto.code !== existing.code) {
      throw new BadRequestException('系統內建類型不可更改代碼');
    }

    // Check unique code if changing
    if (dto.code && dto.code !== existing.code) {
      const dup = await this.prisma.paymentInSourceType.findUnique({
        where: { code: dto.code },
      });
      if (dup) throw new BadRequestException(`代碼 "${dto.code}" 已存在`);
    }

    return this.prisma.paymentInSourceType.update({
      where: { id },
      data: {
        ...(dto.code !== undefined && !existing.is_system
          ? { code: dto.code }
          : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.has_recalculation !== undefined
          ? { has_recalculation: dto.has_recalculation }
          : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
      },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.paymentInSourceType.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('來源類型不存在');
    if (existing.is_system) {
      throw new BadRequestException('系統內建類型不可刪除');
    }
    await this.prisma.paymentInSourceType.delete({ where: { id } });
    return { message: '已刪除' };
  }
}
