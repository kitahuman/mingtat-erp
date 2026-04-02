import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentApplicationsService {
  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  /**
   * Calculate retention amount using cumulative method:
   * retention = min(grossAmount * retentionRate, revisedContractSum * retentionCapRate)
   */
  private calcRetention(
    grossAmount: number,
    retentionRate: number,
    revisedContractSum: number,
    retentionCapRate: number,
  ): number {
    const calculated = grossAmount * retentionRate;
    const cap = revisedContractSum * retentionCapRate;
    return Math.min(calculated, cap);
  }

  /**
   * Recalculate all amount fields (A~K) for a PaymentApplication
   */
  async recalculate(paId: number) {
    const pa = await this.prisma.paymentApplication.findUnique({
      where: { id: paId },
      include: {
        bq_progress: true,
        vo_progress: true,
        materials: true,
        deductions: true,
        contract: {
          include: {
            bq_items: { where: { status: 'active' } },
            variation_orders: { where: { status: 'approved' } },
          },
        },
      },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');

    // (A) BQ work done = sum of bq_progress.current_amount
    const bqWorkDone = pa.bq_progress.reduce((s, p) => s + this.toNum(p.current_amount), 0);

    // (B) VO work done = sum of vo_progress.current_amount
    const voWorkDone = pa.vo_progress.reduce((s, p) => s + this.toNum(p.current_amount), 0);

    // (C) Cumulative work done = A + B
    const cumulativeWorkDone = bqWorkDone + voWorkDone;

    // (D) Materials on site
    const materialsOnSite = pa.materials.reduce((s, m) => s + this.toNum(m.amount), 0);

    // (E) Gross amount = C + D
    const grossAmount = cumulativeWorkDone + materialsOnSite;

    // Revised contract sum for retention cap
    const bqTotal = pa.contract.bq_items.reduce((s, i) => s + this.toNum(i.amount), 0);
    const voTotal = pa.contract.variation_orders.reduce((s, v) => s + this.toNum(v.approved_amount), 0);
    const revisedContractSum = bqTotal + voTotal;

    const retentionRate = this.toNum(pa.contract.retention_rate);
    const retentionCapRate = this.toNum(pa.contract.retention_cap_rate);

    // (F) Retention
    const retentionAmount = this.calcRetention(grossAmount, retentionRate, revisedContractSum, retentionCapRate);

    // (G) After retention = E - F
    const afterRetention = grossAmount - retentionAmount;

    // (H) Other deductions
    const otherDeductions = pa.deductions.reduce((s, d) => s + this.toNum(d.amount), 0);

    // (I) Certified amount = G - H
    const certifiedAmount = afterRetention - otherDeductions;

    // (J) Previous certified amount = certified_amount of the previous IPA (by pa_no)
    let prevCertifiedAmount = 0;
    if (pa.pa_no > 1) {
      const prevPa = await this.prisma.paymentApplication.findFirst({
        where: {
          contract_id: pa.contract_id,
          pa_no: pa.pa_no - 1,
          status: { notIn: ['void'] },
        },
      });
      if (prevPa) {
        prevCertifiedAmount = this.toNum(prevPa.certified_amount);
      }
    }

    // (K) Current due = I - J
    const currentDue = certifiedAmount - prevCertifiedAmount;

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: {
        bq_work_done: parseFloat(bqWorkDone.toFixed(2)),
        vo_work_done: parseFloat(voWorkDone.toFixed(2)),
        cumulative_work_done: parseFloat(cumulativeWorkDone.toFixed(2)),
        materials_on_site: parseFloat(materialsOnSite.toFixed(2)),
        gross_amount: parseFloat(grossAmount.toFixed(2)),
        retention_amount: parseFloat(retentionAmount.toFixed(2)),
        after_retention: parseFloat(afterRetention.toFixed(2)),
        other_deductions: parseFloat(otherDeductions.toFixed(2)),
        certified_amount: parseFloat(certifiedAmount.toFixed(2)),
        prev_certified_amount: parseFloat(prevCertifiedAmount.toFixed(2)),
        current_due: parseFloat(currentDue.toFixed(2)),
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // List IPAs for a contract
  // ═══════════════════════════════════════════════════════════

  async findAll(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        bq_items: { where: { status: 'active' } },
        variation_orders: { where: { status: 'approved' } },
      },
    });
    if (!contract) throw new NotFoundException('合約不存在');

    const ipas = await this.prisma.paymentApplication.findMany({
      where: { contract_id: contractId },
      include: {
        project: { select: { id: true, project_no: true, project_name: true } },
      },
      orderBy: { pa_no: 'asc' },
    });

    // Build summary
    const bqTotal = contract.bq_items.reduce((s, i) => s + this.toNum(i.amount), 0);
    const voTotal = contract.variation_orders.reduce((s, v) => s + this.toNum(v.approved_amount), 0);
    const revisedContractSum = bqTotal + voTotal;

    const activeIpas = ipas.filter(i => i.status !== 'void');
    const lastCertified = activeIpas.filter(i => ['certified', 'paid'].includes(i.status)).slice(-1)[0];
    const lastPaid = activeIpas.filter(i => i.status === 'paid').slice(-1)[0];

    const cumulativeCertified = lastCertified ? this.toNum(lastCertified.certified_amount) : 0;
    const cumulativePaid = activeIpas
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + this.toNum(i.paid_amount), 0);
    const cumulativeRetention = lastCertified ? this.toNum(lastCertified.retention_amount) : 0;
    const completionPct = revisedContractSum > 0
      ? parseFloat(((cumulativeCertified / revisedContractSum) * 100).toFixed(1))
      : 0;

    return {
      data: ipas,
      summary: {
        revised_contract_sum: parseFloat(revisedContractSum.toFixed(2)),
        cumulative_certified: parseFloat(cumulativeCertified.toFixed(2)),
        cumulative_paid: parseFloat(cumulativePaid.toFixed(2)),
        completion_percentage: completionPct,
        cumulative_retention: parseFloat(cumulativeRetention.toFixed(2)),
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Get single IPA with all details
  // ═══════════════════════════════════════════════════════════

  async findOne(contractId: number, paId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
      include: {
        contract: {
          select: {
            id: true,
            contract_no: true,
            contract_name: true,
            retention_rate: true,
            retention_cap_rate: true,
            client: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, project_no: true, project_name: true } },
        bq_progress: {
          include: {
            bq_item: {
              include: {
                section: { select: { id: true, section_code: true, section_name: true } },
              },
            },
          },
          orderBy: { bq_item: { sort_order: 'asc' } },
        },
        vo_progress: {
          include: {
            vo_item: {
              include: {
                variation_order: { select: { id: true, vo_no: true, title: true } },
              },
            },
          },
        },
        deductions: { orderBy: { created_at: 'asc' } },
        materials: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    return { data: pa };
  }

  // ═══════════════════════════════════════════════════════════
  // Create new IPA
  // ═══════════════════════════════════════════════════════════

  async create(contractId: number, dto: any) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        projects: { select: { id: true, project_no: true }, take: 1 },
        bq_items: { where: { status: 'active' }, orderBy: { sort_order: 'asc' } },
        variation_orders: {
          where: { status: 'approved' },
          include: { items: { orderBy: { sort_order: 'asc' } } },
        },
      },
    });
    if (!contract) throw new NotFoundException('合約不存在');

    // Determine next pa_no
    const lastPa = await this.prisma.paymentApplication.findFirst({
      where: { contract_id: contractId },
      orderBy: { pa_no: 'desc' },
    });
    const nextPaNo = (lastPa?.pa_no || 0) + 1;

    // Determine project
    const project = contract.projects[0] || null;
    const projectNo = project?.project_no || contract.contract_no;

    // Reference: DCL-IPA-{ProjectNo}-{期數三位補零}
    const reference = `DCL-IPA-${projectNo}-${String(nextPaNo).padStart(3, '0')}`;

    // Get previous IPA's progress for cumulative carry-forward
    const prevPa = lastPa
      ? await this.prisma.paymentApplication.findUnique({
          where: { id: lastPa.id },
          include: {
            bq_progress: true,
            vo_progress: true,
          },
        })
      : null;

    // Build BQ progress rows
    const bqProgressData = contract.bq_items.map(bq => {
      const prevProgress = prevPa?.bq_progress.find(p => p.bq_item_id === bq.id);
      const prevCumQty = prevProgress ? this.toNum(prevProgress.current_cumulative_qty) : 0;
      return {
        bq_item_id: bq.id,
        prev_cumulative_qty: prevCumQty,
        current_cumulative_qty: prevCumQty, // start with same as previous
        this_period_qty: 0,
        unit_rate: this.toNum(bq.unit_rate),
        prev_cumulative_amount: parseFloat((prevCumQty * this.toNum(bq.unit_rate)).toFixed(2)),
        current_amount: parseFloat((prevCumQty * this.toNum(bq.unit_rate)).toFixed(2)),
        this_period_amount: 0,
      };
    });

    // Build VO progress rows (only approved VOs)
    const voProgressData: any[] = [];
    for (const vo of contract.variation_orders) {
      for (const item of vo.items) {
        const prevProgress = prevPa?.vo_progress.find(p => p.vo_item_id === item.id);
        const prevCumQty = prevProgress ? this.toNum(prevProgress.current_cumulative_qty) : 0;
        voProgressData.push({
          vo_item_id: item.id,
          prev_cumulative_qty: prevCumQty,
          current_cumulative_qty: prevCumQty,
          this_period_qty: 0,
          unit_rate: this.toNum(item.unit_rate),
          prev_cumulative_amount: parseFloat((prevCumQty * this.toNum(item.unit_rate)).toFixed(2)),
          current_amount: parseFloat((prevCumQty * this.toNum(item.unit_rate)).toFixed(2)),
          this_period_amount: 0,
        });
      }
    }

    const pa = await this.prisma.paymentApplication.create({
      data: {
        contract_id: contractId,
        project_id: project?.id || null,
        pa_no: nextPaNo,
        reference,
        period_from: dto.period_from ? new Date(dto.period_from) : null,
        period_to: new Date(dto.period_to),
        status: 'draft',
        remarks: dto.remarks || null,
        bq_progress: { create: bqProgressData },
        vo_progress: { create: voProgressData },
      },
    });

    // Recalculate amounts
    await this.recalculate(pa.id);

    return this.findOne(contractId, pa.id);
  }

  // ═══════════════════════════════════════════════════════════
  // Update IPA basic info
  // ═══════════════════════════════════════════════════════════

  async update(contractId: number, paId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態的 IPA 可以編輯');
    }

    const updateData: any = {};
    if (dto.period_from !== undefined) updateData.period_from = dto.period_from ? new Date(dto.period_from) : null;
    if (dto.period_to !== undefined) updateData.period_to = new Date(dto.period_to);
    if (dto.remarks !== undefined) updateData.remarks = dto.remarks || null;

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: updateData,
    });

    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // Delete IPA (draft only)
  // ═══════════════════════════════════════════════════════════

  async remove(contractId: number, paId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態的 IPA 可以刪除');
    }

    // Check if this is the last IPA
    const lastPa = await this.prisma.paymentApplication.findFirst({
      where: { contract_id: contractId },
      orderBy: { pa_no: 'desc' },
    });
    if (lastPa && lastPa.id !== paId) {
      throw new BadRequestException('只能刪除最後一期 IPA');
    }

    await this.prisma.paymentApplication.delete({ where: { id: paId } });
    return { message: '刪除成功' };
  }

  // ═══════════════════════════════════════════════════════════
  // BQ Progress batch update
  // ═══════════════════════════════════════════════════════════

  async updateBqProgress(contractId: number, paId: number, items: { bq_item_id: number; current_cumulative_qty: number }[]) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態可以更新進度');
    }

    for (const item of items) {
      const progress = await this.prisma.paymentBqProgress.findFirst({
        where: { payment_application_id: paId, bq_item_id: item.bq_item_id },
      });
      if (!progress) continue;

      const currentQty = Number(item.current_cumulative_qty) || 0;
      const prevQty = this.toNum(progress.prev_cumulative_qty);
      const unitRate = this.toNum(progress.unit_rate);
      const thisPeriodQty = currentQty - prevQty;
      const currentAmount = parseFloat((currentQty * unitRate).toFixed(2));
      const prevAmount = parseFloat((prevQty * unitRate).toFixed(2));
      const thisPeriodAmount = parseFloat((thisPeriodQty * unitRate).toFixed(2));

      await this.prisma.paymentBqProgress.update({
        where: { id: progress.id },
        data: {
          current_cumulative_qty: currentQty,
          this_period_qty: thisPeriodQty,
          current_amount: currentAmount,
          prev_cumulative_amount: prevAmount,
          this_period_amount: thisPeriodAmount,
        },
      });
    }

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // VO Progress batch update
  // ═══════════════════════════════════════════════════════════

  async updateVoProgress(contractId: number, paId: number, items: { vo_item_id: number; current_cumulative_qty: number }[]) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態可以更新進度');
    }

    for (const item of items) {
      const progress = await this.prisma.paymentVoProgress.findFirst({
        where: { payment_application_id: paId, vo_item_id: item.vo_item_id },
      });
      if (!progress) continue;

      const currentQty = Number(item.current_cumulative_qty) || 0;
      const prevQty = this.toNum(progress.prev_cumulative_qty);
      const unitRate = this.toNum(progress.unit_rate);
      const thisPeriodQty = currentQty - prevQty;
      const currentAmount = parseFloat((currentQty * unitRate).toFixed(2));
      const prevAmount = parseFloat((prevQty * unitRate).toFixed(2));
      const thisPeriodAmount = parseFloat((thisPeriodQty * unitRate).toFixed(2));

      await this.prisma.paymentVoProgress.update({
        where: { id: progress.id },
        data: {
          current_cumulative_qty: currentQty,
          this_period_qty: thisPeriodQty,
          current_amount: currentAmount,
          prev_cumulative_amount: prevAmount,
          this_period_amount: thisPeriodAmount,
        },
      });
    }

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // Materials CRUD
  // ═══════════════════════════════════════════════════════════

  async addMaterial(contractId: number, paId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以新增物料');

    await this.prisma.paymentMaterial.create({
      data: {
        payment_application_id: paId,
        description: dto.description,
        amount: parseFloat(Number(dto.amount).toFixed(2)),
        remarks: dto.remarks || null,
      },
    });

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  async updateMaterial(contractId: number, paId: number, materialId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以編輯物料');

    const material = await this.prisma.paymentMaterial.findFirst({
      where: { id: materialId, payment_application_id: paId },
    });
    if (!material) throw new NotFoundException('物料不存在');

    await this.prisma.paymentMaterial.update({
      where: { id: materialId },
      data: {
        description: dto.description ?? material.description,
        amount: dto.amount !== undefined ? parseFloat(Number(dto.amount).toFixed(2)) : undefined,
        remarks: dto.remarks !== undefined ? (dto.remarks || null) : undefined,
      },
    });

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  async removeMaterial(contractId: number, paId: number, materialId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以刪除物料');

    await this.prisma.paymentMaterial.delete({ where: { id: materialId } });
    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // Deductions CRUD
  // ═══════════════════════════════════════════════════════════

  async addDeduction(contractId: number, paId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以新增扣款');

    await this.prisma.paymentDeduction.create({
      data: {
        payment_application_id: paId,
        deduction_type: dto.deduction_type || 'other',
        description: dto.description,
        amount: parseFloat(Number(dto.amount).toFixed(2)),
        remarks: dto.remarks || null,
      },
    });

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  async updateDeduction(contractId: number, paId: number, deductionId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以編輯扣款');

    const deduction = await this.prisma.paymentDeduction.findFirst({
      where: { id: deductionId, payment_application_id: paId },
    });
    if (!deduction) throw new NotFoundException('扣款不存在');

    await this.prisma.paymentDeduction.update({
      where: { id: deductionId },
      data: {
        deduction_type: dto.deduction_type ?? deduction.deduction_type,
        description: dto.description ?? deduction.description,
        amount: dto.amount !== undefined ? parseFloat(Number(dto.amount).toFixed(2)) : undefined,
        remarks: dto.remarks !== undefined ? (dto.remarks || null) : undefined,
      },
    });

    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  async removeDeduction(contractId: number, paId: number, deductionId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') throw new BadRequestException('僅草稿狀態可以刪除扣款');

    await this.prisma.paymentDeduction.delete({ where: { id: deductionId } });
    await this.recalculate(paId);
    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // Status transitions
  // ═══════════════════════════════════════════════════════════

  async submit(contractId: number, paId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'draft') {
      throw new BadRequestException('僅草稿狀態可以提交');
    }

    await this.recalculate(paId);

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: {
        status: 'submitted',
        submission_date: new Date(),
      },
    });

    return this.findOne(contractId, paId);
  }

  async certify(contractId: number, paId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'submitted') {
      throw new BadRequestException('僅已提交狀態可以認證');
    }

    const updateData: any = {
      status: 'certified',
      certification_date: new Date(),
    };

    if (dto.payment_due_date) {
      updateData.payment_due_date = new Date(dto.payment_due_date);
    }

    if (dto.client_certified_amount !== null && dto.client_certified_amount !== undefined) {
      const clientAmount = parseFloat(Number(dto.client_certified_amount).toFixed(2));
      updateData.client_certified_amount = clientAmount;
      // Calculate client_current_due
      const prevCertified = this.toNum(pa.prev_certified_amount);
      updateData.client_current_due = parseFloat((clientAmount - prevCertified).toFixed(2));
    }

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: updateData,
    });

    return this.findOne(contractId, paId);
  }

  async recordPayment(contractId: number, paId: number, dto: any) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');
    if (pa.status !== 'certified') {
      throw new BadRequestException('僅已認證狀態可以記錄收款');
    }

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: {
        status: 'paid',
        paid_amount: parseFloat(Number(dto.paid_amount).toFixed(2)),
        paid_date: dto.paid_date ? new Date(dto.paid_date) : new Date(),
      },
    });

    return this.findOne(contractId, paId);
  }

  async void(contractId: number, paId: number) {
    const pa = await this.prisma.paymentApplication.findFirst({
      where: { id: paId, contract_id: contractId },
    });
    if (!pa) throw new NotFoundException('IPA 不存在');

    // Check no subsequent non-void IPA depends on this
    const laterPa = await this.prisma.paymentApplication.findFirst({
      where: {
        contract_id: contractId,
        pa_no: { gt: pa.pa_no },
        status: { notIn: ['void'] },
      },
    });
    if (laterPa) {
      throw new BadRequestException('後續期數的 IPA 仍有效，無法作廢此期');
    }

    await this.prisma.paymentApplication.update({
      where: { id: paId },
      data: { status: 'void' },
    });

    return this.findOne(contractId, paId);
  }

  // ═══════════════════════════════════════════════════════════
  // Contract retention settings
  // ═══════════════════════════════════════════════════════════

  async updateRetention(contractId: number, dto: { retention_rate?: number; retention_cap_rate?: number }) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合約不存在');

    const updateData: any = {};
    if (dto.retention_rate !== undefined) updateData.retention_rate = dto.retention_rate;
    if (dto.retention_cap_rate !== undefined) updateData.retention_cap_rate = dto.retention_cap_rate;

    return this.prisma.contract.update({
      where: { id: contractId },
      data: updateData,
      select: { id: true, retention_rate: true, retention_cap_rate: true },
    });
  }
}
