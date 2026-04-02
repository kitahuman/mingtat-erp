import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RetentionService {
  constructor(private prisma: PrismaService) {}

  private toNum(v: any): number {
    return Number(v) || 0;
  }

  // ═══════════════════════════════════════════════════════════
  // Get retention summary for a contract
  // ═══════════════════════════════════════════════════════════

  async getSummary(contractId: number) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        contract_no: true,
        contract_name: true,
        retention_rate: true,
        retention_cap_rate: true,
      },
    });
    if (!contract) throw new NotFoundException('合約不存在');

    // Get all retention tracking records
    const trackings = await this.prisma.retentionTracking.findMany({
      where: { contract_id: contractId },
      include: {
        payment_application: {
          select: {
            id: true,
            pa_no: true,
            reference: true,
            period_to: true,
            gross_amount: true,
            retention_amount: true,
            status: true,
          },
        },
      },
      orderBy: { pa_no: 'asc' },
    });

    // Get all releases
    const releases = await this.prisma.retentionRelease.findMany({
      where: { contract_id: contractId },
      orderBy: { release_date: 'asc' },
    });

    // Calculate totals
    const totalRetained = trackings.length > 0
      ? this.toNum(trackings[trackings.length - 1].cumulative_retention)
      : 0;
    const totalReleased = releases
      .filter(r => r.status !== 'pending')
      .reduce((sum, r) => sum + this.toNum(r.amount), 0);
    const pendingRelease = releases
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + this.toNum(r.amount), 0);
    const unreleased = totalRetained - totalReleased - pendingRelease;

    return {
      contract,
      summary: {
        total_retained: parseFloat(totalRetained.toFixed(2)),
        total_released: parseFloat(totalReleased.toFixed(2)),
        pending_release: parseFloat(pendingRelease.toFixed(2)),
        unreleased_balance: parseFloat(unreleased.toFixed(2)),
      },
      trackings,
      releases,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Sync retention tracking from IPA data
  // Called when an IPA is certified or recalculated
  // ═══════════════════════════════════════════════════════════

  async syncFromIpa(contractId: number) {
    const ipas = await this.prisma.paymentApplication.findMany({
      where: {
        contract_id: contractId,
        status: { notIn: ['void', 'draft'] },
      },
      orderBy: { pa_no: 'asc' },
    });

    // Upsert retention tracking for each IPA
    let prevCumulative = 0;
    for (const ipa of ipas) {
      const retentionAmount = this.toNum(ipa.retention_amount);
      // For cumulative method: retention_amount in IPA is already the cumulative retention
      // The per-period retention = current cumulative - previous cumulative
      const periodRetention = retentionAmount - prevCumulative;

      await this.prisma.retentionTracking.upsert({
        where: {
          contract_id_payment_application_id: {
            contract_id: contractId,
            payment_application_id: ipa.id,
          },
        },
        create: {
          contract_id: contractId,
          payment_application_id: ipa.id,
          pa_no: ipa.pa_no,
          retention_amount: parseFloat(periodRetention.toFixed(2)),
          cumulative_retention: parseFloat(retentionAmount.toFixed(2)),
        },
        update: {
          pa_no: ipa.pa_no,
          retention_amount: parseFloat(periodRetention.toFixed(2)),
          cumulative_retention: parseFloat(retentionAmount.toFixed(2)),
        },
      });

      prevCumulative = retentionAmount;
    }

    return { message: '扣留金追蹤已同步' };
  }

  // ═══════════════════════════════════════════════════════════
  // Create retention release request
  // ═══════════════════════════════════════════════════════════

  async createRelease(contractId: number, dto: {
    release_date: string;
    amount: number;
    reason: string;
    description?: string;
  }) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('合約不存在');

    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('釋放金額必須大於 0');
    }

    // Calculate unreleased balance
    const summary = await this.getSummary(contractId);
    const maxReleasable = summary.summary.unreleased_balance;

    if (dto.amount > maxReleasable) {
      throw new BadRequestException(
        `釋放金額 ($${dto.amount.toFixed(2)}) 超過未釋放餘額 ($${maxReleasable.toFixed(2)})`,
      );
    }

    const release = await this.prisma.retentionRelease.create({
      data: {
        contract_id: contractId,
        release_date: new Date(dto.release_date),
        amount: dto.amount,
        reason: dto.reason,
        description: dto.description || null,
        status: 'approved',
      },
    });

    // Auto-create PaymentIn record for retention release
    const paymentIn = await this.prisma.paymentIn.create({
      data: {
        date: new Date(dto.release_date),
        amount: dto.amount,
        source_type: 'retention_release',
        source_ref_id: release.id,
        contract_id: contractId,
        remarks: `扣留金釋放 - ${dto.reason === 'pc_release' ? 'PC 釋放' : dto.reason === 'dlp_release' ? 'DLP 釋放' : dto.reason}`,
      },
    });

    // Update release with payment_in_id
    await this.prisma.retentionRelease.update({
      where: { id: release.id },
      data: { payment_in_id: paymentIn.id, status: 'paid' },
    });

    return {
      release: { ...release, payment_in_id: paymentIn.id, status: 'paid' },
      payment_in: paymentIn,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Delete retention release
  // ═══════════════════════════════════════════════════════════

  async deleteRelease(contractId: number, releaseId: number) {
    const release = await this.prisma.retentionRelease.findFirst({
      where: { id: releaseId, contract_id: contractId },
    });
    if (!release) throw new NotFoundException('釋放記錄不存在');

    // Delete associated PaymentIn if exists
    if (release.payment_in_id) {
      await this.prisma.paymentIn.delete({
        where: { id: release.payment_in_id },
      }).catch(() => {}); // Ignore if already deleted
    }

    await this.prisma.retentionRelease.delete({ where: { id: releaseId } });
    return { message: '已刪除釋放記錄' };
  }
}
