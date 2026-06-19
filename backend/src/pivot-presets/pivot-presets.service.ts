import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePivotPresetDto,
  UpdatePivotPresetDto,
  SaveLastUsedDto,
} from './dto/pivot-preset.dto';

// 「上次設定」使用的固定保留名稱（pvp_is_last=true 的紀錄）
const LAST_USED_NAME = '__last_used__';

@Injectable()
export class PivotPresetsService {
  constructor(private prisma: PrismaService) {}

  /** 取得當前用戶所有視圖（含 is_last） */
  async list(userId: number) {
    const presets = await this.prisma.pivotViewPreset.findMany({
      where: { pvp_user_id: userId },
      orderBy: [{ pvp_is_last: 'desc' }, { pvp_updated_at: 'desc' }],
    });
    return presets.map((p) => ({
      id: p.pvp_id,
      name: p.pvp_name,
      config: p.pvp_config,
      is_last: p.pvp_is_last,
      created_at: p.pvp_created_at,
      updated_at: p.pvp_updated_at,
    }));
  }

  /** 新增命名視圖 */
  async create(userId: number, dto: CreatePivotPresetDto) {
    const name = dto.name?.trim();
    if (!name) {
      throw new ConflictException('視圖名稱不可為空');
    }
    if (name === LAST_USED_NAME) {
      throw new ConflictException('此名稱為系統保留名稱');
    }
    const existing = await this.prisma.pivotViewPreset.findUnique({
      where: { pvp_user_id_pvp_name: { pvp_user_id: userId, pvp_name: name } },
    });
    if (existing) {
      throw new ConflictException('已存在同名視圖');
    }
    const created = await this.prisma.pivotViewPreset.create({
      data: {
        pvp_user_id: userId,
        pvp_name: name,
        pvp_config: (dto.config ?? {}) as any,
        pvp_is_last: false,
      },
    });
    return {
      id: created.pvp_id,
      name: created.pvp_name,
      config: created.pvp_config,
      is_last: created.pvp_is_last,
    };
  }

  /** 更新視圖（名稱 / config） */
  async update(userId: number, id: number, dto: UpdatePivotPresetDto) {
    const preset = await this.prisma.pivotViewPreset.findUnique({
      where: { pvp_id: id },
    });
    if (!preset) {
      throw new NotFoundException('視圖不存在');
    }
    if (preset.pvp_user_id !== userId) {
      throw new ForbiddenException('無權修改此視圖');
    }
    const data: any = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new ConflictException('視圖名稱不可為空');
      }
      if (name === LAST_USED_NAME) {
        throw new ConflictException('此名稱為系統保留名稱');
      }
      // 檢查重名（排除自己）
      const dup = await this.prisma.pivotViewPreset.findUnique({
        where: {
          pvp_user_id_pvp_name: { pvp_user_id: userId, pvp_name: name },
        },
      });
      if (dup && dup.pvp_id !== id) {
        throw new ConflictException('已存在同名視圖');
      }
      data.pvp_name = name;
    }
    if (dto.config !== undefined) {
      data.pvp_config = dto.config as any;
    }
    const updated = await this.prisma.pivotViewPreset.update({
      where: { pvp_id: id },
      data,
    });
    return {
      id: updated.pvp_id,
      name: updated.pvp_name,
      config: updated.pvp_config,
      is_last: updated.pvp_is_last,
    };
  }

  /** 刪除視圖 */
  async remove(userId: number, id: number) {
    const preset = await this.prisma.pivotViewPreset.findUnique({
      where: { pvp_id: id },
    });
    if (!preset) {
      throw new NotFoundException('視圖不存在');
    }
    if (preset.pvp_user_id !== userId) {
      throw new ForbiddenException('無權刪除此視圖');
    }
    await this.prisma.pivotViewPreset.delete({ where: { pvp_id: id } });
    return { success: true };
  }

  /**
   * 保存/更新「上次設定」（upsert，pvp_is_last=true）。
   * 使用固定保留名稱 + user 的 unique key 做 upsert。
   */
  async saveLastUsed(userId: number, dto: SaveLastUsedDto) {
    await this.prisma.pivotViewPreset.upsert({
      where: {
        pvp_user_id_pvp_name: {
          pvp_user_id: userId,
          pvp_name: LAST_USED_NAME,
        },
      },
      create: {
        pvp_user_id: userId,
        pvp_name: LAST_USED_NAME,
        pvp_config: (dto.config ?? {}) as any,
        pvp_is_last: true,
      },
      update: {
        pvp_config: (dto.config ?? {}) as any,
        pvp_is_last: true,
      },
    });
    return { success: true };
  }
}
