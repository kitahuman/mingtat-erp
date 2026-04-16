import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SettingItem {
  key: string;
  value: string;
  description?: string;
}

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  /** Get all settings as a key-value map */
  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.systemSetting.findMany();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  /** Get a single setting value (returns defaultValue if not found) */
  async get(key: string, defaultValue = ''): Promise<string> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return row ? row.value : defaultValue;
  }

  /** Get a numeric setting */
  async getNumber(key: string, defaultValue: number): Promise<number> {
    const val = await this.get(key, String(defaultValue));
    const n = Number(val);
    return isNaN(n) ? defaultValue : n;
  }

  /** Upsert a setting */
  async set(key: string, value: string, description?: string): Promise<SettingItem> {
    const row = await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value, ...(description !== undefined ? { description } : {}) },
      create: { key, value, description },
    });
    return { key: row.key, value: row.value, description: row.description ?? undefined };
  }

  /** Bulk upsert settings */
  async setMany(settings: SettingItem[]): Promise<Record<string, string>> {
    for (const s of settings) {
      await this.set(s.key, s.value, s.description);
    }
    return this.getAll();
  }
}
