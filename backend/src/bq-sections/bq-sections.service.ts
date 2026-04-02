import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BqSectionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(contractId: number) {
    // Verify contract exists
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    return this.prisma.contractBqSection.findMany({
      where: { contract_id: contractId },
      include: {
        items: {
          where: { status: 'active' },
          orderBy: { sort_order: 'asc' },
        },
        _count: { select: { items: true } },
      },
      orderBy: { sort_order: 'asc' },
    });
  }

  async create(contractId: number, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    // Check unique section_code within contract
    if (dto.section_code) {
      const existing = await this.prisma.contractBqSection.findUnique({
        where: { contract_id_section_code: { contract_id: contractId, section_code: dto.section_code } },
      });
      if (existing) throw new BadRequestException('此分部代碼在此合約中已存在');
    }

    // Auto sort_order
    if (dto.sort_order === undefined) {
      const maxSort = await this.prisma.contractBqSection.aggregate({
        where: { contract_id: contractId },
        _max: { sort_order: true },
      });
      dto.sort_order = (maxSort._max.sort_order || 0) + 1;
    }

    return this.prisma.contractBqSection.create({
      data: {
        contract_id: contractId,
        section_code: dto.section_code,
        section_name: dto.section_name,
        sort_order: dto.sort_order || 0,
      },
      include: { _count: { select: { items: true } } },
    });
  }

  async update(contractId: number, id: number, dto: any) {
    const section = await this.prisma.contractBqSection.findFirst({
      where: { id, contract_id: contractId },
    });
    if (!section) throw new NotFoundException('分部不存在');

    // Check unique section_code if changed
    if (dto.section_code && dto.section_code !== section.section_code) {
      const existing = await this.prisma.contractBqSection.findUnique({
        where: { contract_id_section_code: { contract_id: contractId, section_code: dto.section_code } },
      });
      if (existing) throw new BadRequestException('此分部代碼在此合約中已存在');
    }

    const updateData: any = {};
    if (dto.section_code !== undefined) updateData.section_code = dto.section_code;
    if (dto.section_name !== undefined) updateData.section_name = dto.section_name;
    if (dto.sort_order !== undefined) updateData.sort_order = Number(dto.sort_order);

    return this.prisma.contractBqSection.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { items: true } } },
    });
  }

  async remove(contractId: number, id: number) {
    const section = await this.prisma.contractBqSection.findFirst({
      where: { id, contract_id: contractId },
      include: { _count: { select: { items: true } } },
    });
    if (!section) throw new NotFoundException('分部不存在');

    if (section._count.items > 0) {
      throw new BadRequestException('此分部下仍有項目，無法刪除');
    }

    await this.prisma.contractBqSection.delete({ where: { id } });
    return { message: '刪除成功' };
  }
}
