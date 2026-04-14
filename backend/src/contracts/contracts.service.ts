import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  private readonly allowedSortFields = [
    'id', 'contract_no', 'contract_name', 'original_amount',
    'sign_date', 'start_date', 'end_date', 'status', 'created_at',
  ];

  async findAll(query: {
    page?: number; limit?: number; search?: string;
    clientId?: number; status?: string;
    sortBy?: string; sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = { deleted_at: null };

    if (query.clientId) where.client_id = Number(query.clientId);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { contract_no: { contains: query.search, mode: 'insensitive' } },
        { contract_name: { contains: query.search, mode: 'insensitive' } },
        { client: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = this.allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'id';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, code: true, english_code: true } },
          _count: { select: { projects: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, code: true, english_code: true, partner_type: true } },
        _count: { select: { projects: true, expenses: true } },
      },
    });
    if (!contract) throw new NotFoundException('合約不存在');
    return contract;
  }

  async findSimple() {
    return this.prisma.contract.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        contract_no: true,
        contract_name: true,
        client_id: true,
        client: { select: { id: true, name: true, code: true } },
      },
      orderBy: { contract_no: 'desc' },
    });
  }

  async create(dto: any, userId?: number, ipAddress?: string) {
    // Check unique contract_no
    if (dto.contract_no) {
      const existing = await this.prisma.contract.findUnique({
        where: { contract_no: dto.contract_no },
      });
      if (existing) {
        throw new BadRequestException('此合約編號已存在');
      }
    }

    // Validate client exists and is a client-type partner
    if (dto.client_id) {
      const partner = await this.prisma.partner.findUnique({
        where: { id: Number(dto.client_id) },
      });
      if (!partner) throw new BadRequestException('客戶不存在');
    }

     const { client, _count, ...data } = dto;
    // Normalize dates: convert empty strings to null, valid strings to Date
    data.sign_date = data.sign_date ? new Date(data.sign_date) : null;
    data.start_date = data.start_date ? new Date(data.start_date) : null;
    data.end_date = data.end_date ? new Date(data.end_date) : null;
    if (data.original_amount !== undefined) data.original_amount = Number(data.original_amount);
    if (data.client_id) data.client_id = Number(data.client_id);
    // Remove empty string fields that would fail type validation
    if (data.description === '') data.description = null;
    const saved = await this.prisma.contract.create({ data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'contracts',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('合約不存在');

    // Check unique contract_no if changed
    if (dto.contract_no && dto.contract_no !== existing.contract_no) {
      const dup = await this.prisma.contract.findUnique({
        where: { contract_no: dto.contract_no },
      });
      if (dup) throw new BadRequestException('此合約編號已存在');
    }

    const { client, _count, created_at, updated_at, id: _id, ...updateData } = dto;

    // Normalize dates
    if (updateData.sign_date) updateData.sign_date = new Date(updateData.sign_date);
    else if (updateData.sign_date === '') updateData.sign_date = null;
    if (updateData.start_date) updateData.start_date = new Date(updateData.start_date);
    else if (updateData.start_date === '') updateData.start_date = null;
    if (updateData.end_date) updateData.end_date = new Date(updateData.end_date);
    else if (updateData.end_date === '') updateData.end_date = null;
    if (updateData.original_amount !== undefined) updateData.original_amount = Number(updateData.original_amount);
    if (updateData.client_id) updateData.client_id = Number(updateData.client_id);

    const updated = await this.prisma.contract.update({ where: { id }, data: updateData });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'contracts',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.contract.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!existing) throw new NotFoundException('合約不存在');
    if (existing._count.projects > 0) {
      throw new BadRequestException('此合約下仍有項目，無法刪除');
    }

    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'contracts',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) { console.error('Audit log error:', e); }
    }
    await this.prisma.contract.update({ where: { id }, data: { deleted_at: new Date(), deleted_by: userId ?? null } });
    return { message: '刪除成功' };
  }

  async merge(dto: { primaryId: number; mergeIds: number[] }, userId?: number, ipAddress?: string) {
    const { primaryId, mergeIds } = dto;

    if (!mergeIds || mergeIds.length === 0) {
      throw new BadRequestException('沒有選擇要合併的合約');
    }

    // Fetch primary contract
    const primary = await this.prisma.contract.findUnique({ where: { id: primaryId } });
    if (!primary) throw new NotFoundException('主合約不存在');

    // Fetch all merge targets
    const targets = await this.prisma.contract.findMany({
      where: { id: { in: mergeIds }, deleted_at: null },
    });
    if (targets.length === 0) throw new NotFoundException('找不到要合併的合約');

    const targetIds = targets.map(t => t.id);
    const targetNos = targets.map(t => t.contract_no);

    // Execute all updates in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Update Projects
      await tx.project.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 2. Update Expenses
      await tx.expense.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 3. Update ContractBqSection
      // Since there's a unique constraint on [contract_id, section_code], we need to handle potential conflicts.
      // For simplicity, we move items first, then delete empty sections.
      const targetSections = await tx.contractBqSection.findMany({
        where: { contract_id: { in: targetIds } },
      });

      for (const section of targetSections) {
        // Find if primary already has this section_code
        const existingPrimarySection = await tx.contractBqSection.findUnique({
          where: { contract_id_section_code: { contract_id: primaryId, section_code: section.section_code } },
        });

        if (existingPrimarySection) {
          // Move items to the existing primary section
          await tx.contractBqItem.updateMany({
            where: { section_id: section.id },
            data: { section_id: existingPrimarySection.id, contract_id: primaryId },
          });
        } else {
          // Move the whole section to the primary contract
          await tx.contractBqSection.update({
            where: { id: section.id },
            data: { contract_id: primaryId },
          });
          // Also update items' contract_id
          await tx.contractBqItem.updateMany({
            where: { section_id: section.id },
            data: { contract_id: primaryId },
          });
        }
      }

      // 4. Update ContractBqItem (those without sections)
      await tx.contractBqItem.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 5. Update VariationOrder
      await tx.variationOrder.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 6. Update PaymentApplication
      await tx.paymentApplication.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 7. Update PaymentIn
      await tx.paymentIn.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 8. Update RetentionTracking & Release
      await tx.retentionTracking.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });
      await tx.retentionRelease.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 9. Update WorkLog
      await tx.workLog.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 10. Update FleetRateCard
      await tx.fleetRateCard.updateMany({
        where: { contract_id: { in: targetIds } },
        data: { contract_id: primaryId },
      });

      // 11. Soft delete the merged contracts
      await tx.contract.updateMany({
        where: { id: { in: targetIds } },
        data: { deleted_at: new Date(), status: 'merged' },
      });

      // Log audit trail
      if (userId) {
        try {
          await this.auditLogsService.log({
            userId,
            action: 'update',
            targetTable: 'contracts',
            targetId: primaryId,
            changesBefore: { note: 'Merging contracts' },
            changesAfter: { mergedIds: targetIds, mergedNos: targetNos },
            ipAddress,
          });
        } catch (e) { console.error('Audit log error:', e); }
      }
    });

    return {
      success: true,
      message: `已將合約 ${targetNos.join('、')} 合併至「${primary.contract_no}」，並遷移了所有相關數據。`,
    };
  }
}
