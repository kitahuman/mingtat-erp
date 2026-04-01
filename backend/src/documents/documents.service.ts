import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEntity(entityType: string, entityId: number) {
    return this.prisma.document.findMany({
      where: { entity_type: entityType, entity_id: entityId, status: 'active' },
      orderBy: { created_at: 'desc' },
    });
  }

  async create(dto: any) {
    return this.prisma.document.create({ data: dto });
  }

  async update(id: number, dto: any) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文件不存在');
    const { id: _id, created_at, updated_at, ...updateData } = dto;
    return this.prisma.document.update({ where: { id }, data: updateData });
  }

  async remove(id: number) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文件不存在');
    // Soft delete - mark as archived
    await this.prisma.document.update({ where: { id }, data: { status: 'archived' } });
    return { success: true };
  }

  async findOne(id: number) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文件不存在');
    return doc;
  }

  getUploadDir() {
    const dir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}
