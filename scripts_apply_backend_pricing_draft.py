from pathlib import Path

root = Path('/home/ubuntu/mingtat-erp')

# 1) Prisma schema: add relation and model
schema = root / 'backend/prisma/schema.prisma'
text = schema.read_text()
old = """  invoice_work_logs      InvoiceWorkLog[]\n  work_log_drafts        InvoiceWorkLogDraft[]\n"""
new = """  invoice_work_logs      InvoiceWorkLog[]\n  work_log_drafts        InvoiceWorkLogDraft[]\n  pricing_draft          InvoicePricingDraft?\n"""
if new not in text:
    if old not in text:
        raise SystemExit('Invoice relation insertion point not found')
    text = text.replace(old, new, 1)

model = """
model InvoicePricingDraft {
  id           Int      @id @default(autoincrement())
  invoice_id   Int      @unique
  pivot_config Json     @db.JsonB
  row_prices   Json     @db.JsonB
  draft_items  Json     @db.JsonB
  updated_at   DateTime @default(now()) @updatedAt

  invoice Invoice @relation(fields: [invoice_id], references: [id], onDelete: Cascade)

  @@map("invoice_pricing_drafts")
}

"""
if 'model InvoicePricingDraft' not in text:
    marker = 'model InvoiceSequence {'
    if marker not in text:
        raise SystemExit('InvoiceSequence marker not found')
    text = text.replace(marker, model + marker, 1)
schema.write_text(text)

# 2) SQL migration
mig_dir = root / 'backend/prisma/migrations/20260601000000_add_invoice_pricing_drafts'
mig_dir.mkdir(parents=True, exist_ok=True)
(mig_dir / 'migration.sql').write_text("""CREATE TABLE IF NOT EXISTS "invoice_pricing_drafts" (
    "id" SERIAL NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "pivot_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "row_prices" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "draft_items" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pricing_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_pricing_drafts_invoice_id_key" ON "invoice_pricing_drafts"("invoice_id");

ALTER TABLE "invoice_pricing_drafts"
ADD CONSTRAINT "invoice_pricing_drafts_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
""")

# 3) DTO additions
dto = root / 'backend/src/invoices/dto/create-invoice.dto.ts'
text = dto.read_text()
if 'SaveInvoicePricingDraftDto' not in text:
    insert = """
export class SaveInvoicePricingDraftDto {
  @IsObject()
  pivot_config: Record<string, unknown>;

  @IsObject()
  row_prices: Record<string, unknown>;

  @IsArray()
  draft_items: Record<string, unknown>[];
}

"""
    marker = 'export class UpdateInvoiceItemDto {'
    if marker not in text:
        raise SystemExit('DTO marker not found')
    text = text.replace(marker, insert + marker, 1)
dto.write_text(text)

# 4) Controller import and endpoints
controller = root / 'backend/src/invoices/invoices.controller.ts'
text = controller.read_text()
text = text.replace(
    'UpdateInvoiceItemsDto } from \'./dto/create-invoice.dto\';',
    'UpdateInvoiceItemsDto, SaveInvoicePricingDraftDto } from \'./dto/create-invoice.dto\';'
)
if '@Get(\':id/pricing-draft\')' not in text:
    marker = """  @Post(':id/match-rates')
  matchRates(@Param('id') id: number, @Body() dto: MatchInvoiceRatesDto) {
    return this.service.matchRates(Number(id), dto);
  }

"""
    insert = """  @Get(':id/pricing-draft')
  getPricingDraft(@Param('id') id: number) {
    return this.service.getPricingDraft(Number(id));
  }

  @Put(':id/pricing-draft')
  savePricingDraft(@Param('id') id: number, @Body() dto: SaveInvoicePricingDraftDto) {
    return this.service.savePricingDraft(Number(id), dto);
  }

"""
    if marker not in text:
        raise SystemExit('Controller insertion marker not found')
    text = text.replace(marker, insert + marker, 1)
controller.write_text(text)

# 5) Service import and methods
service = root / 'backend/src/invoices/invoices.service.ts'
text = service.read_text()
text = text.replace(
    'InvoiceWorkLogDraftData, SaveInvoicePrepareDto, MatchInvoiceRatesDto, UpdateInvoiceItemsDto, InvoicePricingGroupDto',
    'InvoiceWorkLogDraftData, SaveInvoicePrepareDto, MatchInvoiceRatesDto, UpdateInvoiceItemsDto, InvoicePricingGroupDto, SaveInvoicePricingDraftDto'
)
if 'private toJsonInput' not in text:
    marker = """  private isEmptyDraftData(draftData: InvoiceWorkLogDraftData): boolean {
    return Object.keys(draftData || {}).length === 0;
  }

"""
    insert = """  private toJsonInput(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
    if (value === null || value === undefined) return fallback;
    return value as Prisma.InputJsonValue;
  }

"""
    if marker not in text:
        raise SystemExit('Service helper insertion marker not found')
    text = text.replace(marker, marker + insert, 1)
if 'async getPricingDraft' not in text:
    marker = """  async matchRates(invoiceId: number, dto: MatchInvoiceRatesDto) {
"""
    insert = """  async getPricingDraft(invoiceId: number) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_no: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at) throw new NotFoundException('發票不存在');

    const draft = await this.prisma.invoicePricingDraft.findUnique({
      where: { invoice_id: invoiceId },
    });

    return {
      invoice: { id: invoice.id, invoice_no: invoice.invoice_no },
      draft: draft ? {
        id: draft.id,
        invoice_id: draft.invoice_id,
        pivot_config: draft.pivot_config,
        row_prices: draft.row_prices,
        draft_items: draft.draft_items,
        updated_at: draft.updated_at,
      } : null,
    };
  }

  async savePricingDraft(invoiceId: number, dto: SaveInvoicePricingDraftDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, deleted_at: true },
    });
    if (!invoice || invoice.deleted_at) throw new NotFoundException('發票不存在');

    const draft = await this.prisma.invoicePricingDraft.upsert({
      where: { invoice_id: invoiceId },
      create: {
        invoice_id: invoiceId,
        pivot_config: this.toJsonInput(dto.pivot_config, {}),
        row_prices: this.toJsonInput(dto.row_prices, {}),
        draft_items: this.toJsonInput(dto.draft_items, []),
      },
      update: {
        pivot_config: this.toJsonInput(dto.pivot_config, {}),
        row_prices: this.toJsonInput(dto.row_prices, {}),
        draft_items: this.toJsonInput(dto.draft_items, []),
      },
    });

    return {
      id: draft.id,
      invoice_id: draft.invoice_id,
      pivot_config: draft.pivot_config,
      row_prices: draft.row_prices,
      draft_items: draft.draft_items,
      updated_at: draft.updated_at,
    };
  }

"""
    if marker not in text:
        raise SystemExit('Service method insertion marker not found')
    text = text.replace(marker, insert + marker, 1)
service.write_text(text)

# 6) Frontend API helpers
api = root / 'frontend/src/lib/api.ts'
text = api.read_text()
if 'getPricingDraft' not in text:
    text = text.replace(
        "  getPricingData: (id: number) => api.get(`/invoices/${id}/pricing-data`),\n",
        "  getPricingData: (id: number) => api.get(`/invoices/${id}/pricing-data`),\n  getPricingDraft: (id: number) => api.get(`/invoices/${id}/pricing-draft`),\n  savePricingDraft: (id: number, data: { pivot_config: Record<string, unknown>; row_prices: Record<string, unknown>; draft_items: any[] }) => api.put(`/invoices/${id}/pricing-draft`, data),\n",
        1,
    )
api.write_text(text)

print('backend pricing draft patch applied')
