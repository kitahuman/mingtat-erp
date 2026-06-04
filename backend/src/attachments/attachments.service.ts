import { Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentEntityType, CreateAttachmentDto, UpdateAttachmentDto } from './dto/attachment.dto';

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEntity(entityType: AttachmentEntityType, entityId: number) {
    await this.assertEntityExists(entityType, entityId);
    return this.prisma.attachment.findMany({
      where: {
        attachment_entity_type: entityType,
        attachment_entity_id: entityId,
      },
      orderBy: { attachment_created_at: 'desc' },
    });
  }

  async create(
    entityType: AttachmentEntityType,
    entityId: number,
    file: Express.Multer.File,
    dto: CreateAttachmentDto,
    userId?: number,
  ) {
    await this.assertEntityExists(entityType, entityId);

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const relativePath = `attachments/${entityType}/${file.filename}`;
    const fileUrl = `/uploads/${relativePath}`;

    return this.prisma.attachment.create({
      data: {
        attachment_entity_type: entityType,
        attachment_entity_id: entityId,
        attachment_filename: originalName,
        attachment_stored_filename: file.filename,
        attachment_file_path: relativePath,
        attachment_file_url: fileUrl,
        attachment_file_size: file.size,
        attachment_mime_type: file.mimetype,
        attachment_uploaded_by: userId || null,
        attachment_description: dto.attachment_description || null,
      },
    });
  }

  async findOne(id: number) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('附件不存在');
    return attachment;
  }

  async update(id: number, dto: UpdateAttachmentDto) {
    await this.findOne(id);
    return this.prisma.attachment.update({
      where: { id },
      data: {
        attachment_description: dto.attachment_description ?? null,
      },
    });
  }

  async remove(id: number) {
    const attachment = await this.findOne(id);
    await this.prisma.attachment.delete({ where: { id } });

    const diskPath = this.getDiskPath(attachment.attachment_file_path);
    if (existsSync(diskPath)) {
      try {
        unlinkSync(diskPath);
      } catch (error) {
        // 不因實體檔刪除失敗而回滾資料庫刪除；保留 log 方便部署環境排查。
        console.error('Attachment file delete error:', error);
      }
    }

    return { message: '刪除成功', attachment_file_url: attachment.attachment_file_url };
  }

  getDiskPath(relativePath: string) {
    return join(process.cwd(), 'uploads', relativePath);
  }

  private async assertEntityExists(entityType: AttachmentEntityType, entityId: number) {
    let exists = false;

    switch (entityType) {
      case 'company':
        exists = !!(await this.prisma.company.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'quotation':
        exists = !!(await this.prisma.quotation.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'invoice':
        exists = !!(await this.prisma.invoice.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'expense':
        exists = !!(await this.prisma.expense.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'contract':
        exists = !!(await this.prisma.contract.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'project':
        exists = !!(await this.prisma.project.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'payment_in':
        exists = !!(await this.prisma.paymentIn.findFirst({ where: { id: entityId }, select: { id: true } }));
        break;
      case 'payment_out':
        exists = !!(await this.prisma.paymentOut.findFirst({ where: { id: entityId }, select: { id: true } }));
        break;
      case 'work_log':
        exists = !!(await this.prisma.workLog.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      case 'document_folder':
        exists = !!(await this.prisma.documentFolder.findFirst({ where: { id: entityId, deleted_at: null }, select: { id: true } }));
        break;
      default:
        exists = false;
    }

    if (!exists) throw new NotFoundException('關聯記錄不存在');
  }
}
