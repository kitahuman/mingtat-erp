import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubconFleetDriverDto, UpdateSubconFleetDriverDto } from './dto/create-subcon-fleet-driver.dto';
import { SubconFleetDriverQueryDto } from './dto/subcon-fleet-driver-query.dto';
import {
  CreateNicknameMappingDto,
  UpdateNicknameMappingDto,
  NicknameMappingQueryDto,
} from './dto/nickname-mapping.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SubconFleetDriversService {
  constructor(
    private prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

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

  async findAll(query: SubconFleetDriverQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const where: Prisma.SubcontractorFleetDriverWhereInput = {};

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
      'yellow_cert_no', 'red_cert_no', 'status', 'created_at',
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

  /** 取得街車詳情頁面所需的完整資料 */
  async findOneDetail(id: number) {
    const driver = await this.prisma.subcontractorFleetDriver.findUnique({
      where: { id },
      include: {
        subcontractor: {
          select: {
            id: true,
            name: true,
            code: true,
            partner_type: true,
            phone: true,
            contact_person: true,
          },
        },
      },
    });
    if (!driver) throw new NotFoundException('街車司機不存在');

    // 取得相關工作紀錄（最近 50 筆）
    const workLogs = await this.prisma.workLog.findMany({
      where: {
        work_log_fleet_driver_id: id,
        deleted_at: null,
      },
      select: {
        id: true,
        scheduled_date: true,
        service_type: true,
        machine_type: true,
        equipment_number: true,
        start_location: true,
        end_location: true,
        quantity: true,
        unit: true,
        day_night: true,
        status: true,
        is_confirmed: true,
        client: { select: { id: true, name: true } },
        project: { select: { id: true, project_name: true } },
      },
      orderBy: { scheduled_date: 'desc' },
      take: 50,
    });

    // 取得相關街車費率卡
    const rateCards = await this.prisma.subconRateCard.findMany({
      where: {
        subcon_id: driver.subcontractor_id,
        plate_no: driver.plate_no,
        status: 'active',
      },
      select: {
        id: true,
        service_type: true,
        machine_type: true,
        origin: true,
        destination: true,
        rate: true,
        day_rate: true,
        night_rate: true,
        unit: true,
        effective_date: true,
        expiry_date: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // 取得相關文件
    const documents = await this.prisma.document.findMany({
      where: {
        entity_type: 'subcon-fleet-driver',
        entity_id: id,
        status: 'active',
      },
      orderBy: { created_at: 'desc' },
    });

    // 取得花名對應（根據車牌號碼或司機名稱）
    const nicknameMappingWhere: Prisma.VerificationNicknameMappingWhereInput[] = [];
    if (driver.plate_no) {
      nicknameMappingWhere.push({ nickname_vehicle_no: driver.plate_no });
    }
    if (driver.name_zh) {
      nicknameMappingWhere.push({ nickname_employee_name: driver.name_zh });
    }

    const nicknameMappings = nicknameMappingWhere.length > 0
      ? await this.prisma.verificationNicknameMapping.findMany({
          where: { OR: nicknameMappingWhere },
          orderBy: { nickname_created_at: 'desc' },
        })
      : [];

    return {
      ...driver,
      work_logs: workLogs,
      rate_cards: rateCards,
      documents,
      nickname_mappings: nicknameMappings,
    };
  }

  async create(dto: CreateSubconFleetDriverDto, userId?: number, ipAddress?: string) {
    const data: Prisma.SubcontractorFleetDriverCreateInput = {
      name_zh: dto.name_zh || '',
      subcontractor: { connect: { id: Number(dto.subcontractor_id) } },
    };

    // Set optional fields
    if (dto.short_name) data.short_name = dto.short_name;
    if (dto.name_en) data.name_en = dto.name_en;
    if (dto.id_number) data.id_number = dto.id_number;
    if (dto.machine_type) data.machine_type = dto.machine_type;
    if (dto.plate_no) data.plate_no = dto.plate_no;
    if (dto.phone) data.phone = dto.phone;
    if (dto.date_of_birth) data.date_of_birth = new Date(dto.date_of_birth);
    if (dto.yellow_cert_no) data.yellow_cert_no = dto.yellow_cert_no;
    if (dto.red_cert_no) data.red_cert_no = dto.red_cert_no;
    if (dto.has_d_cert !== undefined) data.has_d_cert = dto.has_d_cert;
    if (dto.is_cert_returned !== undefined) data.is_cert_returned = dto.is_cert_returned;
    if (dto.address) data.address = dto.address;
    if (dto.status) data.status = dto.status;

    const saved = await this.prisma.subcontractorFleetDriver.create({ data });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'create',
          targetTable: 'subcon_fleet_drivers',
          targetId: saved.id,
          changesAfter: saved,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateSubconFleetDriverDto, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.subcontractorFleetDriver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車司機不存在');

    const { subcontractor_id, date_of_birth, ...rest } = dto as Record<string, unknown>;
    const updateData: Record<string, unknown> = { ...rest };

    // Remove read-only fields that might be sent from frontend
    delete updateData.subcontractor;
    delete updateData.created_at;
    delete updateData.updated_at;
    delete updateData.id;

    if (date_of_birth) updateData.date_of_birth = new Date(date_of_birth as string);
    else if (date_of_birth === '' || date_of_birth === null) updateData.date_of_birth = null;
    if (subcontractor_id) updateData.subcontractor_id = Number(subcontractor_id);

    // Strip empty string optional fields to avoid type errors
    const stringOptionals = ['short_name', 'name_en', 'id_number', 'machine_type', 'plate_no', 'phone', 'yellow_cert_no', 'red_cert_no', 'address'];
    for (const field of stringOptionals) {
      if (updateData[field] === '') updateData[field] = null;
    }

    const updated = await this.prisma.subcontractorFleetDriver.update({
      where: { id },
      data: updateData as Prisma.SubcontractorFleetDriverUpdateInput,
    });
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'update',
          targetTable: 'subcon_fleet_drivers',
          targetId: id,
          changesBefore: existing,
          changesAfter: updated,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    return this.findOne(id);
  }

  async remove(id: number, userId?: number, ipAddress?: string) {
    const existing = await this.prisma.subcontractorFleetDriver.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('街車司機不存在');
    if (userId) {
      try {
        await this.auditLogsService.log({
          userId,
          action: 'delete',
          targetTable: 'subcon_fleet_drivers',
          targetId: id,
          changesBefore: existing,
          ipAddress,
        });
      } catch (e) {
        console.error('Audit log error:', e);
      }
    }
    await this.prisma.subcontractorFleetDriver.delete({ where: { id } });
    return { message: '刪除成功' };
  }

  // ── Nickname Mapping CRUD ──────────────────────────────────

  async findAllNicknameMappings(query: NicknameMappingQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 50;
    const where: Prisma.VerificationNicknameMappingWhereInput = {};

    if (query.search) {
      where.OR = [
        { nickname_value: { contains: query.search, mode: 'insensitive' } },
        { nickname_employee_name: { contains: query.search, mode: 'insensitive' } },
        { nickname_vehicle_no: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.vehicle_no) {
      where.nickname_vehicle_no = query.vehicle_no;
    }

    const [data, total] = await Promise.all([
      this.prisma.verificationNicknameMapping.findMany({
        where,
        orderBy: { nickname_created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.verificationNicknameMapping.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createNicknameMapping(dto: CreateNicknameMappingDto) {
    return this.prisma.verificationNicknameMapping.create({
      data: {
        nickname_value: dto.nickname_value,
        nickname_employee_id: dto.nickname_employee_id ?? null,
        nickname_employee_name: dto.nickname_employee_name ?? null,
        nickname_vehicle_no: dto.nickname_vehicle_no ?? null,
        nickname_is_active: dto.nickname_is_active ?? true,
      },
    });
  }

  async updateNicknameMapping(id: number, dto: UpdateNicknameMappingDto) {
    const existing = await this.prisma.verificationNicknameMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('花名對應不存在');

    const updateData: Prisma.VerificationNicknameMappingUpdateInput = {};
    if (dto.nickname_value !== undefined) updateData.nickname_value = dto.nickname_value;
    if (dto.nickname_employee_id !== undefined) updateData.nickname_employee_id = dto.nickname_employee_id;
    if (dto.nickname_employee_name !== undefined) updateData.nickname_employee_name = dto.nickname_employee_name;
    if (dto.nickname_vehicle_no !== undefined) updateData.nickname_vehicle_no = dto.nickname_vehicle_no;
    if (dto.nickname_is_active !== undefined) updateData.nickname_is_active = dto.nickname_is_active;

    return this.prisma.verificationNicknameMapping.update({
      where: { id },
      data: updateData,
    });
  }

  async removeNicknameMapping(id: number) {
    const existing = await this.prisma.verificationNicknameMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('花名對應不存在');
    await this.prisma.verificationNicknameMapping.delete({ where: { id } });
    return { message: '刪除成功' };
  }
}
