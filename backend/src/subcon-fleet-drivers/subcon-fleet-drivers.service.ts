import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubconFleetDriversService {
  constructor(private prisma: PrismaService) {}

  async simple() {
    const drivers = await this.prisma.subcontractorFleetDriver.findMany({
      where: {
        status: 'active',
        plate_no: { not: null },
        subcontractor: {
          partner_type: 'subcontractor',
          status: 'active',
        },
      },
      select: {
        id: true,
        plate_no: true,
        machine_type: true,
        name_zh: true,
        subcontractor: {
          select: {
            id: true,
            name: true,
            code: true,
            partner_type: true,
          },
        },
      },
      orderBy: { plate_no: 'asc' },
    });

    return drivers
      .filter(d => d.plate_no && d.subcontractor?.partner_type === 'subcontractor')
      .map(d => ({
        value: d.plate_no!,
        label: `${d.plate_no} (${d.subcontractor?.name || '街車'})`,
        type: d.machine_type,
        tonnage: null,
        category: 'subcon_fleet',
        subcontractor_name: d.subcontractor?.name || null,
        driver_name: d.name_zh,
      }));
  }

  /** 回傳街車司機列表，供工作紀錄員工選單使用 */
  async simpleDrivers() {
    const drivers = await this.prisma.subcontractorFleetDriver.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        name_zh: true,
        plate_no: true,
        short_name: true,
        subcontractor: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name_zh: 'asc' },
    });

    return drivers.map(d => {
      const company = d.subcontractor?.name || '街車';
      const isUnknown = !d.name_zh || d.name_zh === '未知';
      const label = isUnknown
        ? `${company}（街車）${d.plate_no || ''}`
        : `${d.name_zh}（${company}・街車）`;
      return {
        value: `fleet_${d.id}`,
        label,
        name_zh: d.name_zh,
        short_name: d.short_name,
        plate_no: d.plate_no,
        subcontractor_name: company,
        is_fleet: true,
      };
    });
  }

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
    // Normalize date: empty string -> null
    data.date_of_birth = data.date_of_birth ? new Date(data.date_of_birth) : null;
    if (data.subcontractor_id) data.subcontractor_id = Number(data.subcontractor_id);
    // Strip empty string optional fields to avoid type errors
    const stringOptionals = ['short_name', 'name_en', 'id_number', 'machine_type', 'plate_no', 'phone', 'yellow_cert_no', 'red_cert_no', 'address'];
    for (const field of stringOptionals) {
      if (data[field] === '') data[field] = null;
    }
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
