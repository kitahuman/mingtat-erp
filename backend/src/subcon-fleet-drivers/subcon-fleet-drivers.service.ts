import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubconFleetDriversService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    subcontractor_id?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: any = {};

    if (query.subcontractor_id) where.subcontractor_id = Number(query.subcontractor_id);
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name_zh: { contains: query.search, mode: 'insensitive' } },
        { name_en: { contains: query.search, mode: 'insensitive' } },
        { id_number: { contains: query.search, mode: 'insensitive' } },
        { plate_no: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = [
      'id', 'short_name', 'name_zh', 'name_en', 'id_number', 
      'machine_type', 'plate_no', 'phone', 'date_of_birth', 
      'yellow_cert_no', 'red_cert_no', 'status', 'created_at'
    ];
    const sortBy = allowedSortFields.includes(query.sortBy || '') ? query.sortBy! : 'created_at';
    const sortOrder = query.sortOrder?.toUpperCase() === 'ASC' ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.subcontractorFleetDriver.findMany({
        where,
        include: { subcontractor: true },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subcontractorFleetDriver.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const driver = await this.prisma.subcontractorFleetDriver.findUnique({
      where: { id },
      include: { subcontractor: true },
    });
    if (!driver) throw new NotFoundException('街車司機不存在');
    return driver;
  }

  async create(dto: any) {
    const { subcontractor, ...data } = dto;
    // Handle date conversion
    if (data.date_of_birth) data.date_of_birth = new Date(data.date_of_birth);
    if (data.subcontractor_id) data.subcontractor_id = Number(data.subcontractor_id);
    
    const saved = await this.prisma.subcontractorFleetDriver.create({ data });
    return this.findOne(saved.id);
  }

  async update(id: number, dto: any) {
    const existing = await this.prisma.subcontractorFleetDriver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車司機不存在');
    
    const { subcontractor, created_at, updated_at, id: _id, ...updateData } = dto;
    
    if (updateData.date_of_birth) updateData.date_of_birth = new Date(updateData.date_of_birth);
    if (updateData.subcontractor_id) updateData.subcontractor_id = Number(updateData.subcontractor_id);
    
    await this.prisma.subcontractorFleetDriver.update({ where: { id }, data: updateData });
    return this.findOne(id);
  }

  async remove(id: number) {
    const existing = await this.prisma.subcontractorFleetDriver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車司機不存在');
    await this.prisma.subcontractorFleetDriver.delete({ where: { id } });
    return { message: '刪除成功' };
  }
}
