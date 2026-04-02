import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class BqItemsService {
  constructor(private prisma: PrismaService) {}

  /** Recalculate contract original_amount from active BQ items */
  private async syncContractAmount(contractId: number) {
    const result = await this.prisma.contractBqItem.aggregate({
      where: { contract_id: contractId, status: 'active' },
      _sum: { amount: true },
    });
    const total = result._sum.amount || new Decimal(0);
    await this.prisma.contract.update({
      where: { id: contractId },
      data: { original_amount: total },
    });
  }

  async findAll(contractId: number, sectionId?: number) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    const where: any = { contract_id: contractId, status: 'active' };
    if (sectionId !== undefined && sectionId !== null) {
      where.section_id = sectionId === 0 ? null : sectionId;
    }

    return this.prisma.contractBqItem.findMany({
      where,
      include: {
        section: { select: { id: true, section_code: true, section_name: true } },
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  async create(contractId: number, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    // Check unique item_no
    if (dto.item_no) {
      const existing = await this.prisma.contractBqItem.findUnique({
        where: { contract_id_item_no: { contract_id: contractId, item_no: dto.item_no } },
      });
      if (existing) throw new BadRequestException('此項目編號在此合約中已存在');
    }

    // Validate section belongs to same contract
    if (dto.section_id) {
      const section = await this.prisma.contractBqSection.findFirst({
        where: { id: Number(dto.section_id), contract_id: contractId },
      });
      if (!section) throw new BadRequestException('分部不存在或不屬於此合約');
    }

    // Auto-calculate amount
    const quantity = Number(dto.quantity) || 0;
    const unitRate = Number(dto.unit_rate) || 0;
    const amount = parseFloat((quantity * unitRate).toFixed(2));

    // Auto sort_order
    let sortOrder = dto.sort_order;
    if (sortOrder === undefined) {
      const maxSort = await this.prisma.contractBqItem.aggregate({
        where: { contract_id: contractId },
        _max: { sort_order: true },
      });
      sortOrder = (maxSort._max.sort_order || 0) + 1;
    }

    const item = await this.prisma.contractBqItem.create({
      data: {
        contract_id: contractId,
        section_id: dto.section_id ? Number(dto.section_id) : null,
        item_no: dto.item_no,
        description: dto.description,
        quantity,
        unit: dto.unit || null,
        unit_rate: unitRate,
        amount,
        sort_order: Number(sortOrder),
        remarks: dto.remarks || null,
      },
      include: {
        section: { select: { id: true, section_code: true, section_name: true } },
      },
    });

    await this.syncContractAmount(contractId);
    return item;
  }

  async update(contractId: number, id: number, dto: any) {
    const item = await this.prisma.contractBqItem.findFirst({
      where: { id, contract_id: contractId },
    });
    if (!item) throw new NotFoundException('BQ 項目不存在');

    // Check unique item_no if changed
    if (dto.item_no && dto.item_no !== item.item_no) {
      const existing = await this.prisma.contractBqItem.findUnique({
        where: { contract_id_item_no: { contract_id: contractId, item_no: dto.item_no } },
      });
      if (existing) throw new BadRequestException('此項目編號在此合約中已存在');
    }

    // Validate section
    if (dto.section_id !== undefined && dto.section_id !== null && dto.section_id !== '') {
      const section = await this.prisma.contractBqSection.findFirst({
        where: { id: Number(dto.section_id), contract_id: contractId },
      });
      if (!section) throw new BadRequestException('分部不存在或不屬於此合約');
    }

    const updateData: any = {};
    if (dto.item_no !== undefined) updateData.item_no = dto.item_no;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.unit !== undefined) updateData.unit = dto.unit || null;
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;
    if (dto.sort_order !== undefined) updateData.sort_order = Number(dto.sort_order);
    if (dto.status !== undefined) updateData.status = dto.status;

    if (dto.section_id !== undefined) {
      updateData.section_id = (dto.section_id === null || dto.section_id === '' || dto.section_id === 0) ? null : Number(dto.section_id);
    }

    // Recalculate amount
    const quantity = dto.quantity !== undefined ? Number(dto.quantity) : Number(item.quantity);
    const unitRate = dto.unit_rate !== undefined ? Number(dto.unit_rate) : Number(item.unit_rate);
    updateData.quantity = quantity;
    updateData.unit_rate = unitRate;
    updateData.amount = parseFloat((quantity * unitRate).toFixed(2));

    const updated = await this.prisma.contractBqItem.update({
      where: { id },
      data: updateData,
      include: {
        section: { select: { id: true, section_code: true, section_name: true } },
      },
    });

    await this.syncContractAmount(contractId);
    return updated;
  }

  async remove(contractId: number, id: number) {
    const item = await this.prisma.contractBqItem.findFirst({
      where: { id, contract_id: contractId },
    });
    if (!item) throw new NotFoundException('BQ 項目不存在');

    await this.prisma.contractBqItem.delete({ where: { id } });
    await this.syncContractAmount(contractId);
    return { message: '刪除成功' };
  }

  async batchCreate(contractId: number, items: any[]) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    const results: any[] = [];
    let maxSort = (await this.prisma.contractBqItem.aggregate({
      where: { contract_id: contractId },
      _max: { sort_order: true },
    }))._max.sort_order || 0;

    for (const dto of items) {
      // Skip if item_no already exists
      if (dto.item_no) {
        const existing = await this.prisma.contractBqItem.findUnique({
          where: { contract_id_item_no: { contract_id: contractId, item_no: dto.item_no } },
        });
        if (existing) continue; // Skip duplicates
      }

      const quantity = Number(dto.quantity) || 0;
      const unitRate = Number(dto.unit_rate) || 0;
      const amount = parseFloat((quantity * unitRate).toFixed(2));
      maxSort++;

      const item = await this.prisma.contractBqItem.create({
        data: {
          contract_id: contractId,
          section_id: dto.section_id ? Number(dto.section_id) : null,
          item_no: dto.item_no,
          description: dto.description || '',
          quantity,
          unit: dto.unit || null,
          unit_rate: unitRate,
          amount,
          sort_order: maxSort,
          remarks: dto.remarks || null,
        },
      });
      results.push(item);
    }

    await this.syncContractAmount(contractId);
    return { created: results.length, items: results };
  }

  async reorder(contractId: number, orderedIds: number[]) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    for (let i = 0; i < orderedIds.length; i++) {
      await this.prisma.contractBqItem.updateMany({
        where: { id: orderedIds[i], contract_id: contractId },
        data: { sort_order: i + 1 },
      });
    }
    return { message: '排序更新成功' };
  }
}
