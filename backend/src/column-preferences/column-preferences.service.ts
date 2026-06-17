import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveColumnPreferenceDto } from './column-preferences.dto';

@Injectable()
export class ColumnPreferencesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get column preference for a user+page.
   * Priority: personal preference > global default > null (use code default)
   */
  async get(pageKey: string, userId: number) {
    // Try personal preference first
    const personal = await this.prisma.userColumnPreference.findUnique({
      where: { ucp_user_id_ucp_page_key: { ucp_user_id: userId, ucp_page_key: pageKey } },
    });
    if (personal) {
      return { source: 'personal', columns_config: personal.ucp_columns_config };
    }

    // Fall back to global default (user_id = null)
    const globalDefault = await this.prisma.userColumnPreference.findFirst({
      where: { ucp_user_id: null, ucp_page_key: pageKey },
    });
    if (globalDefault) {
      return { source: 'default', columns_config: globalDefault.ucp_columns_config };
    }

    return { source: 'none', columns_config: null };
  }

  /**
   * Save personal preference for a user+page (upsert).
   */
  async savePersonal(pageKey: string, userId: number, dto: SaveColumnPreferenceDto) {
    await this.prisma.userColumnPreference.upsert({
      where: { ucp_user_id_ucp_page_key: { ucp_user_id: userId, ucp_page_key: pageKey } },
      create: {
        ucp_user_id: userId,
        ucp_page_key: pageKey,
        ucp_columns_config: dto.columns_config as any,
      },
      update: {
        ucp_columns_config: dto.columns_config as any,
        ucp_updated_at: new Date(),
      },
    });
    return { success: true };
  }

  /**
   * Save global default for a page (admin only). user_id = null.
   * Prisma upsert does not support null in compound unique keys, so use findFirst + update/create.
   */
  async saveDefault(pageKey: string, dto: SaveColumnPreferenceDto) {
    const existing = await this.prisma.userColumnPreference.findFirst({
      where: { ucp_user_id: null, ucp_page_key: pageKey },
    });
    if (existing) {
      await this.prisma.userColumnPreference.update({
        where: { ucp_id: existing.ucp_id },
        data: {
          ucp_columns_config: dto.columns_config as any,
          ucp_updated_at: new Date(),
        },
      });
    } else {
      await this.prisma.userColumnPreference.create({
        data: {
          ucp_user_id: null,
          ucp_page_key: pageKey,
          ucp_columns_config: dto.columns_config as any,
        },
      });
    }
    return { success: true };
  }

  /**
   * Delete personal preference for a user+page (reset to global default).
   */
  async resetPersonal(pageKey: string, userId: number) {
    await this.prisma.userColumnPreference.deleteMany({
      where: { ucp_user_id: userId, ucp_page_key: pageKey },
    });
    return { success: true };
  }
}
