import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePaymentTermTemplateDto,
  UpdatePaymentTermTemplateDto,
} from './dto/payment-term-template.dto';

@Injectable()
export class PaymentTermTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: { company_id?: number; client_id?: number; all?: boolean } = {}) {
    const companyId = this.toOptionalNumber(query.company_id);
    const clientId = this.toOptionalNumber(query.client_id);
    const where = query.all
      ? undefined
      : {
          OR: [
            { source_type: 'global' },
            ...(companyId ? [{ source_type: 'company', company_id: companyId }] : []),
            ...(clientId ? [{ source_type: 'client', client_id: clientId }] : []),
          ],
        };

    return this.prisma.paymentTermTemplate.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        client: { select: { id: true, name: true, name_en: true } },
      },
      orderBy: [
        { source_type: 'asc' },
        { is_default: 'desc' },
        { name: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async findOne(id: number) {
    const template = await this.prisma.paymentTermTemplate.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        client: { select: { id: true, name: true, name_en: true } },
      },
    });

    if (!template) throw new NotFoundException('付款條款模板不存在');
    return template;
  }

  async create(data: CreatePaymentTermTemplateDto) {
    const sourceType = data.source_type || 'global';

    return this.prisma.paymentTermTemplate.create({
      data: {
        name: data.name,
        content: data.content,
        source_type: sourceType,
        company_id: sourceType === 'company' ? data.company_id || null : null,
        client_id: sourceType === 'client' ? data.client_id || null : null,
        is_default: data.is_default ?? false,
      },
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        client: { select: { id: true, name: true, name_en: true } },
      },
    });
  }

  async update(id: number, data: UpdatePaymentTermTemplateDto) {
    await this.findOne(id);

    const updateData: any = { ...data };

    if ('source_type' in data) {
      updateData.source_type = data.source_type || 'global';
      updateData.company_id = data.source_type === 'company' ? data.company_id || null : null;
      updateData.client_id = data.source_type === 'client' ? data.client_id || null : null;
    } else {
      if ('company_id' in data) updateData.company_id = data.company_id || null;
      if ('client_id' in data) updateData.client_id = data.client_id || null;
    }

    return this.prisma.paymentTermTemplate.update({
      where: { id },
      data: updateData,
      include: {
        company: { select: { id: true, name: true, name_en: true } },
        client: { select: { id: true, name: true, name_en: true } },
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.paymentTermTemplate.delete({ where: { id } });
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
}
