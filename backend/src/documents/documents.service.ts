import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document } from './document.entity';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private repo: Repository<Document>,
  ) {}

  async findByEntity(entityType: string, entityId: number) {
    return this.repo.find({
      where: { entity_type: entityType, entity_id: entityId, status: 'active' },
      order: { created_at: 'DESC' },
    });
  }

  async create(dto: Partial<Document>) {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: number, dto: Partial<Document>) {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('文件不存在');
    await this.repo.update(id, dto);
    return this.repo.findOne({ where: { id } });
  }

  async remove(id: number) {
    const doc = await this.repo.findOne({ where: { id } });
    if (!doc) throw new NotFoundException('文件不存在');
    // Soft delete - mark as archived
    await this.repo.update(id, { status: 'archived' });
    return { success: true };
  }

  async findOne(id: number) {
    const doc = await this.repo.findOne({ where: { id } });
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
