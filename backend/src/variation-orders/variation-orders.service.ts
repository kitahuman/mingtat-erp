import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class VariationOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(contractId: number) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    return this.prisma.variationOrder.findMany({
      where: { contract_id: contractId },
      include: {
        _count: { select: { items: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(contractId: number, id: number) {
    const vo = await this.prisma.variationOrder.findFirst({
      where: { id, contract_id: contractId },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
        contract: { select: { id: true, contract_no: true, contract_name: true } },
      },
    });
    if (!vo) throw new NotFoundException('變更指令不存在');
    return vo;
  }

  async create(contractId: number, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    // Check unique vo_no
    if (dto.vo_no) {
      const existing = await this.prisma.variationOrder.findUnique({
        where: { contract_id_vo_no: { contract_id: contractId, vo_no: dto.vo_no } },
      });
      if (existing) throw new BadRequestException('此 VO 編號在此合約中已存在');
    }

    // Calculate items amounts
    const items = (dto.items || []).map((item: any, index: number) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.unit_rate) || 0;
      return {
        item_no: item.item_no || `${dto.vo_no}-${index + 1}`,
        description: item.description || '',
        quantity: qty,
        unit: item.unit || null,
        unit_rate: rate,
        amount: parseFloat((qty * rate).toFixed(2)),
        sort_order: index + 1,
        remarks: item.remarks || null,
      };
    });

    const totalAmount = items.reduce((sum: number, i: any) => sum + i.amount, 0);

    const vo = await this.prisma.variationOrder.create({
      data: {
        contract_id: contractId,
        vo_no: dto.vo_no,
        title: dto.title,
        description: dto.description || null,
        submitted_date: dto.submitted_date ? new Date(dto.submitted_date) : null,
        approved_date: dto.approved_date ? new Date(dto.approved_date) : null,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        approved_amount: dto.status === 'approved' ? (Number(dto.approved_amount) || parseFloat(totalAmount.toFixed(2))) : 0,
        status: dto.status || 'draft',
        remarks: dto.remarks || null,
        items: { create: items },
      },
      include: {
        items: { orderBy: { sort_order: 'asc' } },
      },
    });

    return vo;
  }

  async update(contractId: number, id: number, dto: any) {
    const vo = await this.prisma.variationOrder.findFirst({
      where: { id, contract_id: contractId },
    });
    if (!vo) throw new NotFoundException('變更指令不存在');

    // Only draft/submitted can be edited (basic fields)
    if (vo.status === 'approved' || vo.status === 'rejected') {
      // Allow only status transitions and approved_amount changes
      if (dto.status === undefined && dto.approved_amount === undefined) {
        throw new BadRequestException('已批准或已拒絕的 VO 無法編輯');
      }
    }

    // Check unique vo_no if changed
    if (dto.vo_no && dto.vo_no !== vo.vo_no) {
      const existing = await this.prisma.variationOrder.findUnique({
        where: { contract_id_vo_no: { contract_id: contractId, vo_no: dto.vo_no } },
      });
      if (existing) throw new BadRequestException('此 VO 編號在此合約中已存在');
    }

    // Handle status transitions
    const newStatus = dto.status || vo.status;
    if (dto.status) {
      const validTransitions: Record<string, string[]> = {
        draft: ['submitted'],
        submitted: ['approved', 'rejected'],
        approved: [],
        rejected: [],
      };
      if (!validTransitions[vo.status]?.includes(dto.status)) {
        throw new BadRequestException(`無法從「${vo.status}」轉換為「${dto.status}」`);
      }
    }

    // Build update data
    const updateData: any = {};
    if (dto.vo_no !== undefined) updateData.vo_no = dto.vo_no;
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description || null;
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (dto.submitted_date !== undefined) {
      updateData.submitted_date = dto.submitted_date ? new Date(dto.submitted_date) : null;
    }
    if (dto.approved_date !== undefined) {
      updateData.approved_date = dto.approved_date ? new Date(dto.approved_date) : null;
    }

    // Auto-set dates on status change
    if (dto.status === 'submitted' && !dto.submitted_date) {
      updateData.submitted_date = new Date();
    }
    if (dto.status === 'approved' && !dto.approved_date) {
      updateData.approved_date = new Date();
    }

    // Handle items update (replace all items)
    if (dto.items !== undefined && (vo.status === 'draft' || vo.status === 'submitted')) {
      // Delete existing items
      await this.prisma.variationOrderItem.deleteMany({
        where: { variation_order_id: id },
      });

      // Create new items
      const items = dto.items.map((item: any, index: number) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.unit_rate) || 0;
        return {
          variation_order_id: id,
          item_no: item.item_no || `${dto.vo_no || vo.vo_no}-${index + 1}`,
          description: item.description || '',
          quantity: qty,
          unit: item.unit || null,
          unit_rate: rate,
          amount: parseFloat((qty * rate).toFixed(2)),
          sort_order: index + 1,
          remarks: item.remarks || null,
        };
      });

      await this.prisma.variationOrderItem.createMany({ data: items });

      const totalAmount = items.reduce((sum: number, i: any) => sum + i.amount, 0);
      updateData.total_amount = parseFloat(totalAmount.toFixed(2));
    }

    // Handle approved_amount
    if (dto.status === 'approved') {
      const currentTotal = updateData.total_amount !== undefined
        ? updateData.total_amount
        : Number(vo.total_amount);
      updateData.approved_amount = dto.approved_amount !== undefined
        ? Number(dto.approved_amount)
        : currentTotal;
    }

    const updated = await this.prisma.variationOrder.update({
      where: { id },
      data: updateData,
      include: {
        items: { orderBy: { sort_order: 'asc' } },
      },
    });

    return updated;
  }

  async remove(contractId: number, id: number) {
    const vo = await this.prisma.variationOrder.findFirst({
      where: { id, contract_id: contractId },
    });
    if (!vo) throw new NotFoundException('變更指令不存在');

    if (vo.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態的 VO 可以刪除');
    }

    await this.prisma.variationOrder.delete({ where: { id } });
    return { message: '刪除成功' };
  }

  /** Get contract financial summary */
  async getContractSummary(contractId: number) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    // Original amount from active BQ items
    const bqResult = await this.prisma.contractBqItem.aggregate({
      where: { contract_id: contractId, status: 'active' },
      _sum: { amount: true },
      _count: true,
    });

    // Approved VO amount
    const approvedVoResult = await this.prisma.variationOrder.aggregate({
      where: { contract_id: contractId, status: 'approved' },
      _sum: { approved_amount: true },
      _count: true,
    });

    // Pending VO amount
    const pendingVoResult = await this.prisma.variationOrder.aggregate({
      where: { contract_id: contractId, status: 'submitted' },
      _sum: { total_amount: true },
    });

    // Total VO count
    const voCount = await this.prisma.variationOrder.count({
      where: { contract_id: contractId },
    });

    const originalAmount = Number(bqResult._sum.amount || 0);
    const approvedVoAmount = Number(approvedVoResult._sum.approved_amount || 0);
    const pendingVoAmount = Number(pendingVoResult._sum.total_amount || 0);

    return {
      data: {
        original_amount: originalAmount,
        approved_vo_amount: approvedVoAmount,
        pending_vo_amount: pendingVoAmount,
        revised_amount: originalAmount + approvedVoAmount,
        bq_items_count: bqResult._count,
        vo_count: voCount,
        approved_vo_count: approvedVoResult._count,
      },
    };
  }
}
