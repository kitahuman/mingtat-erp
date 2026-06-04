import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentFolder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentFolderDto, UpdateDocumentFolderDto } from './dto/document-folder.dto';

export interface DocumentFolderTreeNode {
  id: number;
  name: string;
  parent_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  direct_document_count: number;
  total_document_count: number;
  children: DocumentFolderTreeNode[];
}

@Injectable()
export class DocumentFoldersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<DocumentFolderTreeNode[]> {
    const folders = await this.prisma.documentFolder.findMany({
      where: { deleted_at: null },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

    const folderIds = folders.map(folder => folder.id);
    const attachmentCounts = await this.getAttachmentCounts(folderIds);
    return this.buildTree(folders, attachmentCounts);
  }

  async findOne(id: number): Promise<DocumentFolder> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: { id, deleted_at: null },
    });
    if (!folder) throw new NotFoundException('自訂分類/文件夾不存在');
    return folder;
  }

  async create(dto: CreateDocumentFolderDto, userId?: number): Promise<DocumentFolder> {
    const name = this.normalizeName(dto.name);
    const parentId = dto.parent_id ?? null;

    if (parentId) {
      await this.assertFolderExists(parentId);
    }

    return this.prisma.documentFolder.create({
      data: {
        name,
        parent_id: parentId,
        created_by: userId ?? null,
      },
    });
  }

  async update(id: number, dto: UpdateDocumentFolderDto): Promise<DocumentFolder> {
    await this.assertFolderExists(id);

    const data: { name?: string; parent_id?: number | null } = {};
    if (dto.name !== undefined) data.name = this.normalizeName(dto.name);
    if (dto.parent_id !== undefined) {
      const nextParentId = dto.parent_id ?? null;
      if (nextParentId === id) throw new BadRequestException('不能將文件夾設定為自己的父層');
      if (nextParentId) {
        await this.assertFolderExists(nextParentId);
        await this.assertNotDescendant(id, nextParentId);
      }
      data.parent_id = nextParentId;
    }

    if (Object.keys(data).length === 0) {
      return this.findOne(id);
    }

    return this.prisma.documentFolder.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<{ message: string; deleted_ids: number[] }> {
    await this.assertFolderExists(id);
    const deletedIds = await this.collectDescendantIds(id);
    const now = new Date();

    await this.prisma.documentFolder.updateMany({
      where: { id: { in: deletedIds }, deleted_at: null },
      data: { deleted_at: now },
    });

    return { message: '刪除成功', deleted_ids: deletedIds };
  }

  private async assertFolderExists(id: number): Promise<void> {
    const exists = await this.prisma.documentFolder.findFirst({
      where: { id, deleted_at: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('自訂分類/文件夾不存在');
  }

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) throw new BadRequestException('名稱不能留空');
    return normalized;
  }

  private async assertNotDescendant(folderId: number, candidateParentId: number): Promise<void> {
    const descendantIds = await this.collectDescendantIds(folderId);
    if (descendantIds.includes(candidateParentId)) {
      throw new BadRequestException('不能將文件夾移到自己的子層之下');
    }
  }

  private async collectDescendantIds(rootId: number): Promise<number[]> {
    const folders = await this.prisma.documentFolder.findMany({
      where: { deleted_at: null },
      select: { id: true, parent_id: true },
    });

    const childrenByParent = new Map<number, number[]>();
    for (const folder of folders) {
      if (!folder.parent_id) continue;
      const children = childrenByParent.get(folder.parent_id) ?? [];
      children.push(folder.id);
      childrenByParent.set(folder.parent_id, children);
    }

    const ids: number[] = [];
    const stack = [rootId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || ids.includes(currentId)) continue;
      ids.push(currentId);
      stack.push(...(childrenByParent.get(currentId) ?? []));
    }

    return ids;
  }

  private async getAttachmentCounts(folderIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    if (folderIds.length === 0) return counts;

    const grouped = await this.prisma.attachment.groupBy({
      by: ['attachment_entity_id'],
      where: {
        attachment_entity_type: 'document_folder',
        attachment_entity_id: { in: folderIds },
      },
      _count: { _all: true },
    });

    grouped.forEach(item => counts.set(item.attachment_entity_id, item._count._all));
    return counts;
  }

  private buildTree(folders: DocumentFolder[], attachmentCounts: Map<number, number>): DocumentFolderTreeNode[] {
    const nodeMap = new Map<number, DocumentFolderTreeNode>();
    const roots: DocumentFolderTreeNode[] = [];

    folders.forEach(folder => {
      nodeMap.set(folder.id, {
        id: folder.id,
        name: folder.name,
        parent_id: folder.parent_id,
        created_by: folder.created_by,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
        deleted_at: folder.deleted_at,
        direct_document_count: attachmentCounts.get(folder.id) ?? 0,
        total_document_count: attachmentCounts.get(folder.id) ?? 0,
        children: [],
      });
    });

    nodeMap.forEach(node => {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortAndCount = (nodes: DocumentFolderTreeNode[]): number => {
      nodes.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
      return nodes.reduce((sum, node) => {
        node.total_document_count = node.direct_document_count + sortAndCount(node.children);
        return sum + node.total_document_count;
      }, 0);
    };

    sortAndCount(roots);
    return roots;
  }
}
