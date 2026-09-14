import { NotFoundException } from '@nestjs/common';
import { QuotationsService } from './quotations.service';

describe('QuotationsService duplicate', () => {
  const sourceQuotation = {
    id: 101,
    quotation_no: 'MTQ25090001',
    quotation_parent_id: 88,
    quotation_revision_number: 2,
    quotation_is_active: false,
    quotation_type: 'rental',
    company_id: 1,
    client_id: 2,
    quotation_date: new Date('2026-09-01T00:00:00.000Z'),
    contract_name: 'CT-2026-01',
    display_client_name: '測試客戶',
    project_name: '測試工程',
    project_id: 3,
    total_amount: 1234.5,
    status: 'accepted',
    validity_period: '30 days',
    payment_terms: 'Net 30',
    exclusions: 'Parking excluded',
    external_remark: 'External note',
    internal_remark: 'Internal note',
    pdf_font_sizes: { title: 16 },
    deleted_at: null,
    items: [
      {
        id: 501,
        quotation_id: 101,
        sort_order: 1,
        item_name: '運輸服務',
        item_description: '完整描述',
        quantity: 2,
        unit: 'JOB',
        unit_price: 617.25,
        amount: 1234.5,
        remarks: '項目備註',
        qi_service_type: '運輸',
        qi_day_night: '夜',
        qi_tonnage: '16T',
        qi_machine_type: '貨車',
        qi_origin: '上環',
        qi_destination: '屯門',
        qi_ot_rate: 100,
        qi_mid_shift_rate: 50,
        qi_sync_to_rate_card: true,
      },
    ],
  };

  let service: QuotationsService;
  let prisma: any;
  let auditLogsService: { log: jest.Mock };

  beforeEach(() => {
    const duplicatedQuotation = {
      ...sourceQuotation,
      id: 202,
      quotation_no: 'MTQ26090001',
      quotation_parent_id: null,
      quotation_revision_number: 0,
      quotation_is_active: true,
      quotation_date: new Date('2026-09-13T00:00:00.000Z'),
      status: 'draft',
      created_by: 7,
      invoices: [],
    };

    prisma = {
      quotation: {
        findUnique: jest.fn().mockResolvedValue(sourceQuotation),
        create: jest.fn().mockResolvedValue(duplicatedQuotation),
      },
    };
    auditLogsService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new QuotationsService(prisma, auditLogsService as any);
    jest
      .spyOn(service, 'generateQuotationNo')
      .mockResolvedValue('MTQ26090001');
  });

  it('creates an independent draft with copied fields, settings, and items', async () => {
    const result = await service.duplicate(101, 7, '203.0.113.7');

    expect(service.generateQuotationNo).toHaveBeenCalledWith(
      1,
      2,
      expect.any(String),
    );
    expect(prisma.quotation.create).toHaveBeenCalledTimes(1);

    const createInput = prisma.quotation.create.mock.calls[0][0];
    expect(createInput.data).toMatchObject({
      quotation_no: 'MTQ26090001',
      quotation_parent_id: null,
      quotation_revision_number: 0,
      quotation_is_active: true,
      quotation_type: 'rental',
      company_id: 1,
      client_id: 2,
      project_id: 3,
      total_amount: 1234.5,
      status: 'draft',
      pdf_font_sizes: { title: 16 },
      created_by: 7,
      items: {
        create: [
          {
            sort_order: 1,
            item_name: '運輸服務',
            item_description: '完整描述',
            quantity: 2,
            unit: 'JOB',
            unit_price: 617.25,
            amount: 1234.5,
            remarks: '項目備註',
            qi_service_type: '運輸',
            qi_day_night: '夜',
            qi_tonnage: '16T',
            qi_machine_type: '貨車',
            qi_origin: '上環',
            qi_destination: '屯門',
            qi_ot_rate: 100,
            qi_mid_shift_rate: 50,
            qi_sync_to_rate_card: true,
          },
        ],
      },
    });
    expect(createInput.data.quotation_date).toBeInstanceOf(Date);
    expect(createInput.data.quotation_date).not.toEqual(
      sourceQuotation.quotation_date,
    );
    expect(auditLogsService.log).toHaveBeenCalledWith({
      userId: 7,
      action: 'create',
      targetTable: 'quotations',
      targetId: 202,
      changesAfter: expect.objectContaining({ id: 202 }),
      ipAddress: '203.0.113.7',
    });
    expect(result).toMatchObject({
      id: 202,
      quotation_no: 'MTQ26090001',
      status: 'draft',
      is_rate_only_total: false,
    });
  });

  it('rejects missing or soft-deleted source quotations', async () => {
    prisma.quotation.findUnique.mockResolvedValue({
      ...sourceQuotation,
      deleted_at: new Date(),
    });

    await expect(service.duplicate(101)).rejects.toThrow(NotFoundException);
    expect(prisma.quotation.create).not.toHaveBeenCalled();
  });
});

describe('QuotationsService generateQuotationNo', () => {
  let service: QuotationsService;
  let prisma: any;

  beforeEach(() => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      quotationSequence: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      quotation: {
        findMany: jest.fn(),
      },
    };

    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ internal_prefix: 'MT' }),
      },
      partner: {
        findUnique: jest.fn().mockResolvedValue({ english_code: 'ABC' }),
      },
      $transaction: jest.fn((callback) => callback(transaction)),
      transaction,
    };
    service = new QuotationsService(prisma, { log: jest.fn() } as any);
  });

  it('uses the company, client code, and supplied date in the number prefix', async () => {
    prisma.transaction.quotationSequence.findUnique.mockResolvedValue({
      id: 1,
      last_seq: 6,
    });
    prisma.transaction.quotation.findMany.mockResolvedValue([]);
    prisma.transaction.quotationSequence.upsert.mockResolvedValue({
      last_seq: 7,
    });

    await expect(
      service.generateQuotationNo(1, 2, '2026-09-13T03:00:00.000Z'),
    ).resolves.toBe('MTQABC26090007');

    expect(
      prisma.transaction.quotationSequence.findUnique,
    ).toHaveBeenCalledWith({
      where: {
        prefix_year_month: { prefix: 'MTQABC', year_month: '2609' },
      },
    });
    expect(prisma.transaction.quotation.findMany).toHaveBeenCalledWith({
      where: { quotation_no: { startsWith: 'MTQABC2609' } },
      select: { quotation_no: true },
    });
  });

  it('advances from the actual high-water mark when the sequence is stale', async () => {
    prisma.transaction.quotationSequence.findUnique.mockResolvedValue({
      id: 1,
      last_seq: 6,
    });
    prisma.transaction.quotation.findMany.mockResolvedValue([
      { quotation_no: 'MTQABC2609000A' },
      { quotation_no: 'MTQABC2609LEGACY' },
    ]);
    prisma.transaction.quotationSequence.upsert.mockResolvedValue({
      last_seq: 11,
    });

    await expect(
      service.generateQuotationNo(1, 2, '2026-09-13T03:00:00.000Z'),
    ).resolves.toBe('MTQABC2609000B');

    expect(prisma.transaction.quotationSequence.upsert).toHaveBeenCalledWith({
      where: {
        prefix_year_month: { prefix: 'MTQABC', year_month: '2609' },
      },
      create: { prefix: 'MTQABC', year_month: '2609', last_seq: 11 },
      update: { last_seq: 11 },
    });
  });

  it('uses the company-only format when no client is selected', async () => {
    prisma.transaction.quotationSequence.findUnique.mockResolvedValue(null);
    prisma.transaction.quotation.findMany.mockResolvedValue([]);
    prisma.transaction.quotationSequence.upsert.mockResolvedValue({
      last_seq: 1,
    });

    await expect(
      service.generateQuotationNo(1, null, '2026-10-01T00:00:00.000Z'),
    ).resolves.toBe('MTQ26100001');

    expect(prisma.partner.findUnique).not.toHaveBeenCalled();
  });

  it('uses the Hong Kong calendar month at a UTC month boundary', async () => {
    prisma.transaction.quotationSequence.findUnique.mockResolvedValue(null);
    prisma.transaction.quotation.findMany.mockResolvedValue([]);
    prisma.transaction.quotationSequence.upsert.mockResolvedValue({
      last_seq: 1,
    });

    await expect(
      service.generateQuotationNo(1, null, '2026-09-30T16:30:00.000Z'),
    ).resolves.toBe('MTQ26100001');
  });

  it('rejects an invalid quotation date before allocating a sequence', async () => {
    await expect(
      service.generateQuotationNo(1, null, 'not-a-date'),
    ).rejects.toThrow('無效日期');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
