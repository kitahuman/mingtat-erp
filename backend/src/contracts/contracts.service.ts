import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto, UpdateContractDto } from './dto/create-contract.dto';

interface FindContractsQuery {
  page?: number;
  limit?: number;
  search?: string;
  clientId?: number;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
}

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService, private readonly auditLogsService: AuditLogsService) {}

  private readonly allowedSortFields = [
    'id', 'contract_no', 'contract_name', 'original_amount',
    'sign_date', 'start_date', 'end_date', 'status', 'created_at',
  ];

  async findAll(query: FindContractsQuery) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Prisma.ContractWhereInput = { deleted_at: null };

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
        advance_payment_invoice: {
          select: {
            id: true,
            invoice_no: true,
            invoice_title: true,
            date: true,
            total_amount: true,
            status: true,
          },
        },
        projects: {
          where: { deleted_at: null },
          select: { id: true, project_no: true, project_name: true },
          take: 1,
          orderBy: { id: 'desc' },
        },
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

  private async generateContractNo(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { internal_prefix: true },
    });
    if (!company?.internal_prefix) {
      throw new BadRequestException('公司不存在或未設定前綴');
    }

    const companyPrefix = company.internal_prefix;
    const year = new Date().getFullYear();
    const prefix = `${companyPrefix}-CT-${year}-`;
    const contracts = await this.prisma.contract.findMany({
      where: { contract_no: { startsWith: prefix } },
      select: { contract_no: true },
    });

    const pattern = new RegExp(`^${companyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-CT-${year}-(\\d{3,})$`);
    const maxSerial = contracts.reduce((max, contract) => {
      const match = contract.contract_no.match(pattern);
      if (!match) return max;
      const serial = Number(match[1]);
      return Number.isFinite(serial) && serial > max ? serial : max;
    }, 0);

    return `${prefix}${String(maxSerial + 1).padStart(3, '0')}`;
  }

  private async ensureContractNoUnique(contractNo: string, excludeId?: number): Promise<void> {
    const duplicate = await this.prisma.contract.findFirst({
      where: {
        contract_no: contractNo,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(`合約編號「${contractNo}」已被其他合約使用`);
    }
  }

  private handleUniqueConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('contract_no')
    ) {
      throw new ConflictException('合約編號已被其他合約使用，請重新提交');
    }

    throw error;
  }

  private calculateAdvancePaymentAmount(
    originalAmount: number | string | Prisma.Decimal | null | undefined,
    rate: number | string | Prisma.Decimal | null | undefined,
  ): number | null {
    if (rate === undefined || rate === null) return null;

    const numericOriginalAmount = Number(originalAmount ?? 0);
    const numericRate = Number(rate);
    if (!Number.isFinite(numericOriginalAmount) || !Number.isFinite(numericRate)) return null;

    return Math.round(numericOriginalAmount * numericRate * 100) / 100;
  }

  private async ensureAdvancePaymentInvoiceExists(invoiceId?: number | null): Promise<void> {
    if (invoiceId === undefined || invoiceId === null) return;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: Number(invoiceId) },
      select: { id: true },
    });
    if (!invoice) throw new BadRequestException('按金發票不存在');
  }

  async create(dto: CreateContractDto, userId?: number, ipAddress?: string) {
    // Validate client exists and is a client-type partner
    if (dto.client_id) {
      const partner = await this.prisma.partner.findUnique({
        where: { id: Number(dto.client_id) },
      });
      if (!partner) throw new BadRequestException('客戶不存在');
    }

    const {
      client_id,
      company_id,
      contract_name,
      description,
      sign_date,
      start_date,
      end_date,
      original_amount,
      status,
      retention_rate,
      retention_cap_rate,
      advance_payment_rate,
      advance_payment_amount,
      advance_payment_invoice_id,
    } = dto;
    if (!company_id) {
      throw new BadRequestException('請選擇公司以建立合約編號');
    }

    const contractNo = await this.generateContractNo(Number(company_id));
    await this.ensureContractNoUnique(contractNo);
    await this.ensureAdvancePaymentInvoiceExists(advance_payment_invoice_id);

    const data: Prisma.ContractUncheckedCreateInput = {
      contract_no: contractNo,
      client_id: Number(client_id),
      contract_name: contract_name ?? '',
      description: description === '' ? null : description,
      sign_date: sign_date ? new Date(sign_date) : null,
      start_date: start_date ? new Date(start_date) : null,
      end_date: end_date ? new Date(end_date) : null,
      original_amount: original_amount !== undefined ? Number(original_amount) : undefined,
      status: status ?? 'active',
      retention_rate: retention_rate !== undefined ? Number(retention_rate) : undefined,
      retention_cap_rate: retention_cap_rate !== undefined ? Number(retention_cap_rate) : undefined,
      advance_payment_rate: advance_payment_rate !== undefined && advance_payment_rate !== null ? Number(advance_payment_rate) : advance_payment_rate,
      advance_payment_amount:
        advance_payment_amount !== undefined
          ? advance_payment_amount === null ? null : Number(advance_payment_amount)
          : advance_payment_rate !== undefined && advance_payment_rate !== null
            ? this.calculateAdvancePaymentAmount(original_amount, advance_payment_rate)
            : undefined,
      advance_payment_invoice_id: advance_payment_invoice_id !== undefined && advance_payment_invoice_id !== null ? Number(advance_payment_invoice_id) : advance_payment_invoice_id,
    };

    let saved: Awaited<ReturnType<typeof this.prisma.contract.create>>;
    try {
      saved = await this.prisma.contract.create({ data });
    } catch (error) {
      this.handleUniqueConstraintError(error);
    }

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

  async update(id: number, dto: UpdateContractDto, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.contract.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('合約不存在');

    // Check unique contract_no if changed
    if (dto.contract_no && dto.contract_no !== existing.contract_no) {
      await this.ensureContractNoUnique(dto.contract_no, id);
    }

    const {
      client_id,
      contract_no,
      contract_name,
      description,
      sign_date,
      start_date,
      end_date,
      original_amount,
      status,
      retention_rate,
      retention_cap_rate,
      advance_payment_rate,
      advance_payment_amount,
      advance_payment_invoice_id,
      advance_release_rate,
    } = dto;
    await this.ensureAdvancePaymentInvoiceExists(advance_payment_invoice_id);

    const updateData: Prisma.ContractUncheckedUpdateInput = {};

    if (contract_no !== undefined) updateData.contract_no = contract_no;
    if (client_id !== undefined) updateData.client_id = Number(client_id);
    if (contract_name !== undefined) updateData.contract_name = contract_name;
    if (description !== undefined) updateData.description = description === '' ? null : description;
    if (sign_date !== undefined) updateData.sign_date = sign_date ? new Date(sign_date) : null;
    if (start_date !== undefined) updateData.start_date = start_date ? new Date(start_date) : null;
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null;
    if (original_amount !== undefined) updateData.original_amount = Number(original_amount);
    if (status !== undefined) updateData.status = status;
    if (retention_rate !== undefined) updateData.retention_rate = Number(retention_rate);
    if (retention_cap_rate !== undefined) updateData.retention_cap_rate = Number(retention_cap_rate);
    if (advance_payment_rate !== undefined) updateData.advance_payment_rate = advance_payment_rate === null ? null : Number(advance_payment_rate);
    if (advance_payment_amount !== undefined) {
      updateData.advance_payment_amount = advance_payment_amount === null ? null : Number(advance_payment_amount);
    } else if (advance_payment_rate !== undefined && advance_payment_rate !== null) {
      updateData.advance_payment_amount = this.calculateAdvancePaymentAmount(
        original_amount !== undefined ? original_amount : existing.original_amount,
        advance_payment_rate,
      );
    }
    if (advance_payment_invoice_id !== undefined) {
      updateData.advance_payment_invoice_id = advance_payment_invoice_id === null ? null : Number(advance_payment_invoice_id);
    }
    if (advance_release_rate !== undefined) updateData.advance_release_rate = Number(advance_release_rate);

    let updated: Awaited<ReturnType<typeof this.prisma.contract.update>>;
    try {
      updated = await this.prisma.contract.update({ where: { id }, data: updateData });
    } catch (error) {
      this.handleUniqueConstraintError(error);
    }

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

    // Trigger recalculation for draft IPAs if rates changed
    const rateChanged =
      (retention_rate !== undefined && Number(retention_rate) !== Number(existing.retention_rate)) ||
      (advance_release_rate !== undefined && Number(advance_release_rate) !== Number(existing.advance_release_rate));

    if (rateChanged) {
      const ipas = await this.prisma.paymentApplication.findMany({
        where: { contract_id: id, status: 'draft' },
        orderBy: { pa_no: 'asc' },
        include: { bq_progress: true, vo_progress: true, materials: true, deductions: true },
      });

      const currentRetentionRate = Number(updated.retention_rate);
      // Note: recalculate logic currently doesn't persist advance_release_rate in the IPA table itself, 
      // but it affects certified_amount and current_due calculations.
      
      for (const ipa of ipas) {
        const bqWorkDone = ipa.bq_progress.reduce((s, p) => s + Number(p.current_amount || 0), 0);
        const voWorkDone = ipa.vo_progress.reduce((s, p) => s + Number(p.current_amount || 0), 0);
        const cumulativeWorkDone = bqWorkDone + voWorkDone;
        const materialsOnSite = ipa.materials.reduce((s, m) => s + Number(m.amount || 0), 0);
        const grossAmount = cumulativeWorkDone + materialsOnSite;
        
        // Retention = cumulativeWorkDone * retentionRate (matches latest business logic)
        const retentionAmount = cumulativeWorkDone * currentRetentionRate;
        const afterRetention = grossAmount - retentionAmount;
        const otherDeductions = ipa.deductions.reduce((s, d) => s + Number(d.amount || 0), 0);
        const certifiedAmount = afterRetention - otherDeductions;
        
        // Get previous IPA certified amount (could be draft or not, we need the latest value)
        const prevIpa = await this.prisma.paymentApplication.findFirst({
          where: { contract_id: id, pa_no: ipa.pa_no - 1, status: { not: 'void' } },
          select: { certified_amount: true },
        });
        const prevCertifiedAmount = prevIpa ? Number(prevIpa.certified_amount) : 0;
        const currentDue = certifiedAmount - prevCertifiedAmount;

        await this.prisma.paymentApplication.update({
          where: { id: ipa.id },
          data: {
            bq_work_done: parseFloat(bqWorkDone.toFixed(2)),
            vo_work_done: parseFloat(voWorkDone.toFixed(2)),
            cumulative_work_done: parseFloat(cumulativeWorkDone.toFixed(2)),
            gross_amount: parseFloat(grossAmount.toFixed(2)),
            retention_amount: parseFloat(retentionAmount.toFixed(2)),
            after_retention: parseFloat(afterRetention.toFixed(2)),
            certified_amount: parseFloat(certifiedAmount.toFixed(2)),
            current_due: parseFloat(currentDue.toFixed(2)),
          },
        });
      }
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
