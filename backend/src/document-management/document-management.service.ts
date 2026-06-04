import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentManagementModule,
  DocumentManagementSource,
  ListDocumentManagementQueryDto,
  DocumentTreeQueryDto,
  DocumentTreeNode,
} from './dto/document-management.dto';

export interface UnifiedDocumentRecord {
  id: string;
  numeric_id?: number;
  source: DocumentManagementSource;
  module: DocumentManagementModule;
  module_label: string;
  entity_type: string;
  entity_id: number;
  entity_label: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  doc_type: string | null;
  description: string | null;
  uploaded_at: Date | null;
  download_url: string;
  preview_url: string;
}

export interface ResolvedFile {
  filePath: string;
  fileName: string;
  mimeType?: string | null;
}

const MODULE_LABELS: Record<DocumentManagementModule, string> = {
  company: '公司',
  employee: '員工',
  vehicle: '車輛',
  machinery: '機械',
  partner: '客戶/供應商',
  'company-profile': '公司檔案',
  'subcon-fleet-driver': '街車司機',
  quotation: '報價單',
  invoice: '發票',
  expense: '支出',
  contract: '合約',
  project: '工程項目',
  'daily-report': '工程日報',
  'acceptance-report': '工程收貨',
  document_folder: '自訂分類',
};

const SOURCE_LABELS: Record<DocumentManagementSource, string> = {
  attachment: '通用附件',
  document: '舊文件表',
  'expense-attachment': '支出附件',
  'daily-report-attachment': '工程日報附件',
  'acceptance-report-attachment': '工程收貨附件',
  'company-file': '公司檔案',
  document_folder: '自訂分類',
};

@Injectable()
export class DocumentManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDocumentManagementQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const rows = await this.collectRows();
    const filtered = this.applyFilters(rows, query);
    filtered.sort((a, b) => this.timeValue(b.uploaded_at) - this.timeValue(a.uploaded_at));

    const total = filtered.length;
    const data = filtered.slice((page - 1) * limit, page * limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      total_pages: Math.ceil(total / limit) || 1,
      modules: Object.entries(MODULE_LABELS).map(([value, label]) => ({ value, label })),
      sources: Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label })),
    };
  }

  async resolveFile(source: DocumentManagementSource, id: string): Promise<ResolvedFile> {
    switch (source) {
      case 'attachment': {
        const attachment = await this.prisma.attachment.findUnique({ where: { id: Number(id) } });
        if (!attachment) throw new NotFoundException('文件不存在');
        return {
          filePath: join(process.cwd(), 'uploads', attachment.attachment_file_path),
          fileName: attachment.attachment_filename,
          mimeType: attachment.attachment_mime_type,
        };
      }
      case 'document': {
        const document = await this.prisma.document.findFirst({ where: { id: Number(id), status: 'active' } });
        if (!document) throw new NotFoundException('文件不存在');
        return {
          filePath: join(process.cwd(), 'uploads', document.file_path),
          fileName: document.file_name,
          mimeType: document.mime_type,
        };
      }
      case 'expense-attachment': {
        const attachment = await this.prisma.expenseAttachment.findUnique({ where: { id: Number(id) } });
        if (!attachment) throw new NotFoundException('文件不存在');
        return {
          filePath: this.resolveUploadPathFromUrl(attachment.file_url),
          fileName: attachment.file_name,
          mimeType: attachment.mime_type,
        };
      }
      case 'daily-report-attachment': {
        const attachment = await this.prisma.dailyReportAttachment.findUnique({ where: { id: Number(id) } });
        if (!attachment) throw new NotFoundException('文件不存在');
        return {
          filePath: this.resolveUploadPathFromUrl(attachment.daily_report_attachment_file_url),
          fileName: attachment.daily_report_attachment_file_name,
          mimeType: attachment.daily_report_attachment_file_type,
        };
      }
      case 'acceptance-report-attachment': {
        const attachment = await this.prisma.acceptanceReportAttachment.findUnique({ where: { id: Number(id) } });
        if (!attachment) throw new NotFoundException('文件不存在');
        return {
          filePath: this.resolveUploadPathFromUrl(attachment.acceptance_report_attachment_file_url),
          fileName: attachment.acceptance_report_attachment_file_name,
          mimeType: attachment.acceptance_report_attachment_file_type,
        };
      }
      case 'document_folder':
      case 'company-file': {
        if (source === 'document_folder') {
          const attachment = await this.prisma.attachment.findUnique({ where: { id: Number(id) } });
          if (!attachment || attachment.attachment_entity_type !== 'document_folder') throw new NotFoundException('文件不存在');
          return {
            filePath: join(process.cwd(), 'uploads', attachment.attachment_file_path),
            fileName: attachment.attachment_filename,
            mimeType: attachment.attachment_mime_type,
          };
        }

        const [companyIdPart, kind] = id.split(':');
        const companyId = Number(companyIdPart);
        if (!companyId || !['logo', 'stamp'].includes(kind)) throw new NotFoundException('文件不存在');
        const company = await this.prisma.company.findFirst({ where: { id: companyId, deleted_at: null } });
        if (!company) throw new NotFoundException('文件不存在');
        const fileUrl = kind === 'logo' ? company.company_logo_url : company.company_stamp_url;
        if (!fileUrl) throw new NotFoundException('文件不存在');
        return {
          filePath: this.resolveUploadPathFromUrl(fileUrl),
          fileName: `${company.name}-${kind === 'logo' ? '公司Logo' : '公司印'}${this.extFromPath(fileUrl)}`,
          mimeType: this.guessImageMime(fileUrl),
        };
      }
      default:
        throw new NotFoundException('文件不存在');
    }
  }

  ensureFileExists(resolved: ResolvedFile) {
    if (!existsSync(resolved.filePath)) {
      throw new NotFoundException('實體文件不存在');
    }
    return resolved;
  }

  private async collectRows(): Promise<UnifiedDocumentRecord[]> {
    const rows: UnifiedDocumentRecord[] = [];
    await Promise.all([
      this.collectAttachments(rows),
      this.collectDocumentFolderAttachments(rows),
      this.collectDocuments(rows),
      this.collectExpenseAttachments(rows),
      this.collectDailyReportAttachments(rows),
      this.collectAcceptanceReportAttachments(rows),
      this.collectCompanyFiles(rows),
    ]);
    return rows;
  }

  private async collectAttachments(rows: UnifiedDocumentRecord[]) {
    const attachments = await this.prisma.attachment.findMany({
      where: { NOT: { attachment_entity_type: 'document_folder' } },
      orderBy: { attachment_created_at: 'desc' },
    });
    const labels = await this.buildEntityLabels(attachments.map((a) => ({ type: a.attachment_entity_type, id: a.attachment_entity_id })));

    for (const attachment of attachments) {
      const module = this.normalizeModule(attachment.attachment_entity_type);
      if (!module) continue;
      rows.push({
        id: String(attachment.id),
        numeric_id: attachment.id,
        source: 'attachment',
        module,
        module_label: MODULE_LABELS[module],
        entity_type: attachment.attachment_entity_type,
        entity_id: attachment.attachment_entity_id,
        entity_label: labels.get(`${attachment.attachment_entity_type}:${attachment.attachment_entity_id}`) || `#${attachment.attachment_entity_id}`,
        file_name: attachment.attachment_filename,
        file_size: attachment.attachment_file_size ?? this.tryFileSize(join(process.cwd(), 'uploads', attachment.attachment_file_path)),
        mime_type: attachment.attachment_mime_type,
        doc_type: null,
        description: attachment.attachment_description,
        uploaded_at: attachment.attachment_created_at,
        download_url: this.fileUrl('attachment', String(attachment.id), 'download'),
        preview_url: this.fileUrl('attachment', String(attachment.id), 'preview'),
      });
    }
  }


  private async collectDocumentFolderAttachments(rows: UnifiedDocumentRecord[]) {
    const attachments = await this.prisma.attachment.findMany({
      where: { attachment_entity_type: 'document_folder' },
      orderBy: { attachment_created_at: 'desc' },
    });
    if (attachments.length === 0) return;

    const folders = await this.prisma.documentFolder.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, parent_id: true },
    });
    const folderLabelMap = this.buildFolderLabelMap(folders);

    for (const attachment of attachments) {
      const entityLabel = folderLabelMap.get(attachment.attachment_entity_id);
      if (!entityLabel) continue;
      rows.push({
        id: String(attachment.id),
        numeric_id: attachment.id,
        source: 'document_folder',
        module: 'document_folder',
        module_label: MODULE_LABELS.document_folder,
        entity_type: 'document_folder',
        entity_id: attachment.attachment_entity_id,
        entity_label: entityLabel,
        file_name: attachment.attachment_filename,
        file_size: attachment.attachment_file_size ?? this.tryFileSize(join(process.cwd(), 'uploads', attachment.attachment_file_path)),
        mime_type: attachment.attachment_mime_type,
        doc_type: null,
        description: attachment.attachment_description,
        uploaded_at: attachment.attachment_created_at,
        download_url: this.fileUrl('document_folder', String(attachment.id), 'download'),
        preview_url: this.fileUrl('document_folder', String(attachment.id), 'preview'),
      });
    }
  }

  private async collectDocuments(rows: UnifiedDocumentRecord[]) {
    const documents = await this.prisma.document.findMany({ where: { status: 'active' }, orderBy: { created_at: 'desc' } });
    const labels = await this.buildEntityLabels(documents.map((d) => ({ type: d.entity_type, id: d.entity_id })));

    for (const document of documents) {
      const module = this.normalizeModule(document.entity_type);
      if (!module) continue;
      rows.push({
        id: String(document.id),
        numeric_id: document.id,
        source: 'document',
        module,
        module_label: MODULE_LABELS[module],
        entity_type: document.entity_type,
        entity_id: document.entity_id,
        entity_label: labels.get(`${document.entity_type}:${document.entity_id}`) || `#${document.entity_id}`,
        file_name: document.file_name,
        file_size: document.file_size ?? this.tryFileSize(join(process.cwd(), 'uploads', document.file_path)),
        mime_type: document.mime_type,
        doc_type: document.doc_type,
        description: document.notes,
        uploaded_at: document.created_at,
        download_url: this.fileUrl('document', String(document.id), 'download'),
        preview_url: this.fileUrl('document', String(document.id), 'preview'),
      });
    }
  }

  private async collectExpenseAttachments(rows: UnifiedDocumentRecord[]) {
    const attachments = await this.prisma.expenseAttachment.findMany({
      include: { expense: true },
      orderBy: { uploaded_at: 'desc' },
    });

    for (const attachment of attachments) {
      if ((attachment.expense as any)?.deleted_at) continue;
      rows.push({
        id: String(attachment.id),
        numeric_id: attachment.id,
        source: 'expense-attachment',
        module: 'expense',
        module_label: MODULE_LABELS.expense,
        entity_type: 'expense',
        entity_id: attachment.expense_id,
        entity_label: this.expenseLabel(attachment.expense),
        file_name: attachment.file_name,
        file_size: attachment.file_size ?? this.tryFileSize(this.resolveUploadPathFromUrl(attachment.file_url)),
        mime_type: attachment.mime_type,
        doc_type: '支出附件',
        description: null,
        uploaded_at: attachment.uploaded_at,
        download_url: this.fileUrl('expense-attachment', String(attachment.id), 'download'),
        preview_url: this.fileUrl('expense-attachment', String(attachment.id), 'preview'),
      });
    }
  }

  private async collectDailyReportAttachments(rows: UnifiedDocumentRecord[]) {
    const attachments = await this.prisma.dailyReportAttachment.findMany({
      include: { report: true },
      orderBy: { daily_report_attachment_created_at: 'desc' },
    });

    for (const attachment of attachments) {
      if ((attachment.report as any)?.daily_report_deleted_at) continue;
      rows.push({
        id: String(attachment.id),
        numeric_id: attachment.id,
        source: 'daily-report-attachment',
        module: 'daily-report',
        module_label: MODULE_LABELS['daily-report'],
        entity_type: 'daily-report',
        entity_id: attachment.daily_report_attachment_report_id,
        entity_label: this.dailyReportLabel(attachment.report),
        file_name: attachment.daily_report_attachment_file_name,
        file_size: this.tryFileSize(this.resolveUploadPathFromUrl(attachment.daily_report_attachment_file_url)),
        mime_type: attachment.daily_report_attachment_file_type,
        doc_type: '工程日報附件',
        description: null,
        uploaded_at: attachment.daily_report_attachment_created_at,
        download_url: this.fileUrl('daily-report-attachment', String(attachment.id), 'download'),
        preview_url: this.fileUrl('daily-report-attachment', String(attachment.id), 'preview'),
      });
    }
  }

  private async collectAcceptanceReportAttachments(rows: UnifiedDocumentRecord[]) {
    const attachments = await this.prisma.acceptanceReportAttachment.findMany({ include: { report: true } });

    for (const attachment of attachments) {
      rows.push({
        id: String(attachment.id),
        numeric_id: attachment.id,
        source: 'acceptance-report-attachment',
        module: 'acceptance-report',
        module_label: MODULE_LABELS['acceptance-report'],
        entity_type: 'acceptance-report',
        entity_id: attachment.acceptance_report_attachment_report_id,
        entity_label: this.acceptanceReportLabel(attachment.report),
        file_name: attachment.acceptance_report_attachment_file_name,
        file_size: this.tryFileSize(this.resolveUploadPathFromUrl(attachment.acceptance_report_attachment_file_url)),
        mime_type: attachment.acceptance_report_attachment_file_type,
        doc_type: '工程收貨附件',
        description: null,
        uploaded_at: attachment.report?.acceptance_report_created_at || null,
        download_url: this.fileUrl('acceptance-report-attachment', String(attachment.id), 'download'),
        preview_url: this.fileUrl('acceptance-report-attachment', String(attachment.id), 'preview'),
      });
    }
  }

  private async collectCompanyFiles(rows: UnifiedDocumentRecord[]) {
    const companies = await this.prisma.company.findMany({
      where: {
        deleted_at: null,
        OR: [{ company_logo_url: { not: null } }, { company_stamp_url: { not: null } }],
      },
      select: { id: true, name: true, company_logo_url: true, company_stamp_url: true, updated_at: true },
    });

    for (const company of companies) {
      for (const kind of ['logo', 'stamp'] as const) {
        const url = kind === 'logo' ? company.company_logo_url : company.company_stamp_url;
        if (!url) continue;
        const id = `${company.id}:${kind}`;
        rows.push({
          id,
          source: 'company-file',
          module: 'company',
          module_label: MODULE_LABELS.company,
          entity_type: 'company',
          entity_id: company.id,
          entity_label: company.name,
          file_name: `${company.name}-${kind === 'logo' ? '公司Logo' : '公司印'}${this.extFromPath(url)}`,
          file_size: this.tryFileSize(this.resolveUploadPathFromUrl(url)),
          mime_type: this.guessImageMime(url),
          doc_type: kind === 'logo' ? '公司 Logo' : '公司印',
          description: '公司發票品牌設定檔案',
          uploaded_at: company.updated_at,
          download_url: this.fileUrl('company-file', id, 'download'),
          preview_url: this.fileUrl('company-file', id, 'preview'),
        });
      }
    }
  }

  private applyFilters(rows: UnifiedDocumentRecord[], query: ListDocumentManagementQueryDto) {
    const q = this.normalizeText(query.q || '');
    const fileName = this.normalizeText(query.file_name || '');
    const from = query.date_from ? new Date(`${query.date_from}T00:00:00`) : null;
    const to = query.date_to ? new Date(`${query.date_to}T23:59:59.999`) : null;

    return rows.filter((row) => {
      if (query.module && row.module !== query.module) return false;
      if (query.source && row.source !== query.source) return false;
      if (query.entity_id !== undefined && Number(row.entity_id) !== Number(query.entity_id)) return false;
      if (query.doc_type && row.doc_type !== query.doc_type) return false;
      if (fileName && !this.normalizeText(row.file_name).includes(fileName)) return false;
      if (from && row.uploaded_at && row.uploaded_at < from) return false;
      if (to && row.uploaded_at && row.uploaded_at > to) return false;
      if (q) {
        const haystack = this.normalizeText([
          row.file_name,
          row.module_label,
          row.entity_label,
          row.doc_type,
          row.description,
        ].filter(Boolean).join(' '));
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  private buildFolderLabelMap(folders: Array<{ id: number; name: string; parent_id: number | null }>) {
    const folderById = new Map(folders.map(folder => [folder.id, folder]));
    const labelMap = new Map<number, string>();

    const resolveLabel = (folderId: number, visited = new Set<number>()): string => {
      const cached = labelMap.get(folderId);
      if (cached) return cached;
      const folder = folderById.get(folderId);
      if (!folder) return `#${folderId}`;
      if (!folder.parent_id || visited.has(folder.parent_id)) {
        labelMap.set(folderId, folder.name);
        return folder.name;
      }
      visited.add(folderId);
      const label = `${resolveLabel(folder.parent_id, visited)} / ${folder.name}`;
      labelMap.set(folderId, label);
      return label;
    };

    folders.forEach(folder => resolveLabel(folder.id));
    return labelMap;
  }

  private async buildEntityLabels(keys: Array<{ type: string; id: number }>) {
    const labels = new Map<string, string>();
    const idsByType = new Map<string, Set<number>>();
    for (const key of keys) {
      if (!idsByType.has(key.type)) idsByType.set(key.type, new Set<number>());
      idsByType.get(key.type)!.add(Number(key.id));
    }

    await Promise.all(Array.from(idsByType.entries()).map(async ([type, idSet]) => {
      const ids = Array.from(idSet);
      switch (type) {
        case 'company': {
          const rows = await this.prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, r.name));
          break;
        }
        case 'employee': {
          const rows = await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, emp_code: true, name_zh: true, name_en: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.emp_code, r.name_zh || r.name_en].filter(Boolean).join(' - ')));
          break;
        }
        case 'vehicle': {
          const rows = await this.prisma.vehicle.findMany({ where: { id: { in: ids } }, select: { id: true, plate_number: true, machine_type: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.plate_number, r.machine_type].filter(Boolean).join(' - ')));
          break;
        }
        case 'machinery': {
          const rows = await this.prisma.machinery.findMany({ where: { id: { in: ids } }, select: { id: true, machine_code: true, machine_type: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.machine_code, r.machine_type].filter(Boolean).join(' - ')));
          break;
        }
        case 'partner': {
          const rows = await this.prisma.partner.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.code, r.name].filter(Boolean).join(' - ')));
          break;
        }
        case 'company-profile': {
          const rows = await this.prisma.companyProfile.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, chinese_name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.code, r.chinese_name].filter(Boolean).join(' - ')));
          break;
        }
        case 'subcon-fleet-driver': {
          const rows = await this.prisma.subcontractorFleetDriver.findMany({ where: { id: { in: ids } }, select: { id: true, name_zh: true, name_en: true, phone: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.name_zh || r.name_en, r.phone].filter(Boolean).join(' - ')));
          break;
        }
        case 'quotation': {
          const rows = await this.prisma.quotation.findMany({ where: { id: { in: ids } }, select: { id: true, quotation_no: true, contract_name: true, project_name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.quotation_no, r.contract_name || r.project_name].filter(Boolean).join(' - ')));
          break;
        }
        case 'invoice': {
          const rows = await this.prisma.invoice.findMany({ where: { id: { in: ids } }, select: { id: true, invoice_no: true, invoice_title: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.invoice_no, r.invoice_title].filter(Boolean).join(' - ')));
          break;
        }
        case 'expense': {
          const rows = await this.prisma.expense.findMany({ where: { id: { in: ids } }, select: { id: true, expense_receipt_number: true, item: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, this.expenseLabel(r)));
          break;
        }
        case 'contract': {
          const rows = await this.prisma.contract.findMany({ where: { id: { in: ids } }, select: { id: true, contract_no: true, contract_name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.contract_no, r.contract_name].filter(Boolean).join(' - ')));
          break;
        }
        case 'project': {
          const rows = await this.prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, project_no: true, project_name: true } });
          rows.forEach((r) => labels.set(`${type}:${r.id}`, [r.project_no, r.project_name].filter(Boolean).join(' - ')));
          break;
        }
        default:
          break;
      }
    }));

    return labels;
  }

  private normalizeModule(entityType: string): DocumentManagementModule | null {
    if (entityType === 'document_folder') return 'document_folder';
    const normalized = entityType.replace(/_/g, '-');
    if ((Object.keys(MODULE_LABELS) as string[]).includes(normalized)) {
      return normalized as DocumentManagementModule;
    }
    return null;
  }

  private fileUrl(source: DocumentManagementSource, id: string, action: 'download' | 'preview') {
    return `/document-management/${source}/${encodeURIComponent(id)}/${action}`;
  }

  private resolveUploadPathFromUrl(fileUrl: string) {
    // If it's an external URL without /uploads/ marker, return the URL as-is for redirect
    if (/^https?:\/\//i.test(fileUrl)) {
      let pathname: string;
      try {
        pathname = new URL(fileUrl).pathname;
      } catch {
        return fileUrl;
      }
      const marker = '/uploads/';
      const markerIndex = pathname.indexOf(marker);
      if (markerIndex >= 0) {
        return join(process.cwd(), 'uploads', pathname.slice(markerIndex + marker.length));
      }
      // External URL without /uploads/ path (e.g. S3) - return full URL for redirect
      return fileUrl;
    }
    const marker = '/uploads/';
    const markerIndex = fileUrl.indexOf(marker);
    if (markerIndex >= 0) {
      return join(process.cwd(), 'uploads', fileUrl.slice(markerIndex + marker.length));
    }
    return join(process.cwd(), 'uploads', fileUrl.replace(/^\/+/, ''));
  }

  private tryFileSize(filePath: string): number | null {
    try {
      return existsSync(filePath) ? statSync(filePath).size : null;
    } catch {
      return null;
    }
  }

  private extFromPath(filePath: string) {
    const clean = filePath.split('?')[0] || '';
    const match = clean.match(/\.[a-z0-9]+$/i);
    return match ? match[0] : '';
  }

  private guessImageMime(filePath: string) {
    const ext = this.extFromPath(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  }

  private normalizeText(value: string) {
    return value.toLowerCase().trim();
  }

  async getDocumentTree(query: DocumentTreeQueryDto): Promise<DocumentTreeNode[]> {
    const allRows = await this.collectRows();

    // Apply initial filters if any
    const filteredRows = allRows.filter(row => {
      if (query.module && row.module !== query.module) return false;
      // For entity_id and doc_type, we'll filter at the respective levels
      return true;
    });

    const tree: DocumentTreeNode[] = [];
    const moduleMap = new Map<string, DocumentTreeNode>();

    for (const row of filteredRows) {
      if (row.module === 'document_folder') continue;

      // Level 1: Module
      if (!moduleMap.has(row.module)) {
        moduleMap.set(row.module, {
          label: row.module_label,
          value: row.module,
          type: 'module',
          count: 0,
          children: [],
        });
        tree.push(moduleMap.get(row.module)!);
      }
      const moduleNode = moduleMap.get(row.module)!;
      moduleNode.count++;

      // Level 2: Entity (Record)
      const entityKey = `${row.module}:${row.entity_id}`;
      let entityNode = moduleNode.children?.find(child => child.value === entityKey);
      if (!entityNode) {
        entityNode = {
          label: row.entity_label,
          value: entityKey,
          type: 'entity',
          count: 0,
          children: [],
        };
        moduleNode.children?.push(entityNode);
      }
      entityNode.count++;

      // Level 3: Document Type (if available)
      if (row.doc_type) {
        const docTypeKey = `${entityKey}:${row.doc_type}`;
        let docTypeNode = entityNode.children?.find(child => child.value === docTypeKey);
        if (!docTypeNode) {
          docTypeNode = {
            label: row.doc_type,
            value: docTypeKey,
            type: 'doc_type',
            count: 0,
          };
          entityNode.children?.push(docTypeNode);
        }
        docTypeNode.count++;
      }
    }

    if (!query.module || query.module === 'document_folder') {
      const folderNodes = await this.buildDocumentFolderTreeNodes(filteredRows.filter(row => row.module === 'document_folder'));
      tree.push(...folderNodes);
    }

    // Sort nodes for consistent display
    tree.sort((a, b) => a.label.localeCompare(b.label));
    tree.forEach(moduleNode => {
      moduleNode.children?.sort((a, b) => a.label.localeCompare(b.label));
      moduleNode.children?.forEach(entityNode => {
        entityNode.children?.sort((a, b) => a.label.localeCompare(b.label));
      });
    });

    // Append counts to labels after all counts are finalized
    const appendCounts = (nodes: DocumentTreeNode[]) => {
      nodes.forEach(node => {
        node.label = `${node.label} (${node.count})`;
        if (node.children) {
          appendCounts(node.children);
        }
      });
    };
    appendCounts(tree);

    return tree;
  }

  private async buildDocumentFolderTreeNodes(rows: UnifiedDocumentRecord[]): Promise<DocumentTreeNode[]> {
    const directCounts = new Map<number, number>();
    rows.forEach(row => directCounts.set(row.entity_id, (directCounts.get(row.entity_id) ?? 0) + 1));

    const folders = await this.prisma.documentFolder.findMany({
      where: { deleted_at: null },
      select: { id: true, name: true, parent_id: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    const nodeMap = new Map<number, DocumentTreeNode & { parentId: number | null }>();
    folders.forEach(folder => {
      nodeMap.set(folder.id, {
        label: folder.name,
        value: `document_folder:${folder.id}`,
        type: 'folder',
        count: directCounts.get(folder.id) ?? 0,
        children: [],
        parentId: folder.parent_id,
      });
    });

    const roots: Array<DocumentTreeNode & { parentId: number | null }> = [];
    nodeMap.forEach(node => {
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children?.push(node);
      } else {
        roots.push(node);
      }
    });

    const rollup = (node: DocumentTreeNode & { parentId: number | null }): number => {
      node.children?.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
      const childrenCount = node.children?.reduce((sum, child) => sum + rollup(child as DocumentTreeNode & { parentId: number | null }), 0) ?? 0;
      node.count += childrenCount;
      return node.count;
    };

    roots.sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'));
    roots.forEach(root => rollup(root));
    return roots.map(root => this.stripFolderTreeInternalFields(root));
  }

  private stripFolderTreeInternalFields(node: DocumentTreeNode & { parentId?: number | null }): DocumentTreeNode {
    return {
      label: node.label,
      value: node.value,
      type: node.type,
      count: node.count,
      children: node.children?.map(child => this.stripFolderTreeInternalFields(child)),
    };
  }

  private timeValue(value: Date | null) {
    return value ? value.getTime() : 0;
  }

  private expenseLabel(expense: any) {
    return [expense?.expense_receipt_number, expense?.item].filter(Boolean).join(' - ') || `#${expense?.id || ''}`;
  }

  private dailyReportLabel(report: any) {
    const date = report?.daily_report_date ? new Date(report.daily_report_date).toISOString().slice(0, 10) : '';
    return [date, report?.daily_report_project_name].filter(Boolean).join(' - ') || `#${report?.id || ''}`;
  }

  private acceptanceReportLabel(report: any) {
    const date = report?.acceptance_report_date ? new Date(report.acceptance_report_date).toISOString().slice(0, 10) : '';
    return [date, report?.acceptance_report_project_name].filter(Boolean).join(' - ') || `#${report?.id || ''}`;
  }
}
