import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { FieldOption, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DuplicateLocationCandidateDto,
  DuplicateLocationGroupDto,
  DuplicateLocationReason,
  FindDuplicateLocationsQueryDto,
  LocationOptionsQueryDto,
  LocationOptionSortBy,
  LocationUsageOptionDto,
  SortDirection,
} from './dto/field-options.dto';

const DEFAULT_OPTIONS: Record<string, string[]> = {
  employee_role: ['管理', '司機', '機手', '雜工', '鴻輝代工', '散工機手', '管工', '安全督導員', '董事', 'T1'],
  machine_type: ['平斗', '勾斗', '夾斗', '拖頭', '車斗', '貨車', '輕型貨車', '私家車', '燈車', '挖掘機', '火轆'],
  tonnage: ['3噸', '5.5噸', '8噸', '10噸', '11噸', '13噸', '14噸', '20噸', '24噸', '30噸', '33噸', '35噸', '38噸', '44噸', '49噸'],
  wage_unit: ['小時', '車', '天', '周', '月', '噸', 'M', 'M2', 'M3', 'JOB', '工', '次', '轉', 'trip', '晚'],
  service_type: ['運輸', '代工', '工程', '機械', '管工工作', '維修保養', '雜務', '上堂', '緊急情況', '請假/休息'],
  day_night: ['日', '夜', '中直'],
  product_unit: ['噸', 'M', 'M2', 'M3', '車', '次', '轉', 'trip', 'JOB', '件', '包', '桶', '箱', '板'],
  payment_method: ['支票', '現金', '銀行轉帳', 'EPS', 'FPS 轉數快', '信用卡', '網上銀行', '其他'],
  project_location: [],
  certificate_type: [
    '駕駛執照', '建造業安全訓練證明書（平安卡）', '建造業工人註冊證（工卡）',
    '核准工人證明書', '操作搬土機證明書', '操作挖掘機證明書',
    '起重機操作員證明書', '操作貨車弔機證明書', '操作履帶式固定弔臂起重機證明書',
    '操作輪胎式液壓伸縮弔臂起重機證明書', '機場禁區通行證', '金門證', '禮頓證',
    '密閉空間作業核准工人證明書', '操作壓實機證明書', '弔索銀咭',
    '工藝測試證明書', '壓實負荷物移動機械操作員機證明書', '升降台安全使用訓練證書',
  ],
};

interface LocationUsageCount {
  total: number;
  start: number;
  end: number;
}

interface LocationUsageCountRow {
  location: string;
  start_count: number | bigint;
  end_count: number | bigint;
  usage_count: number | bigint;
}

@Injectable()
export class FieldOptionsService implements OnModuleInit {
  private readonly logger = new Logger(FieldOptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  async seedDefaults() {
    const count = await this.prisma.fieldOption.count();
    if (count === 0) {
      // First time: seed all categories
      const data: Prisma.FieldOptionCreateManyInput[] = [];
      for (const [category, labels] of Object.entries(DEFAULT_OPTIONS)) {
        labels.forEach((label, idx) => {
          data.push({ category, label, sort_order: idx + 1, is_active: true });
        });
      }
      await this.prisma.fieldOption.createMany({ data });
      console.log(`Seeded ${data.length} field options`);
      return;
    }

    // Seed any new categories that don't exist yet
    for (const [category, labels] of Object.entries(DEFAULT_OPTIONS)) {
      const existing = await this.prisma.fieldOption.count({ where: { category } });
      if (existing === 0) {
        const data = labels.map((label, idx) => ({
          category, label, sort_order: idx + 1, is_active: true,
        }));
        await this.prisma.fieldOption.createMany({ data });
        console.log(`Seeded ${data.length} field options for new category: ${category}`);
      }
    }
  }

  async findByCategory(category: string) {
    return this.prisma.fieldOption.findMany({
      where: { category },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  async findAllGrouped() {
    const all = await this.prisma.fieldOption.findMany({
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    const grouped: Record<string, FieldOption[]> = {};
    for (const opt of all) {
      if (!grouped[opt.category]) grouped[opt.category] = [];
      grouped[opt.category].push(opt);
    }
    return grouped;
  }

  async create(dto: { category: string; label: string; sort_order?: number }) {
    // Check if it already exists in the same category to prevent duplicates
    const existing = await this.prisma.fieldOption.findFirst({
      where: {
        category: dto.category,
        label: dto.label,
      },
    });
    if (existing) return existing;

    if (!dto.sort_order) {
      const max = await this.prisma.fieldOption.aggregate({
        where: { category: dto.category },
        _max: { sort_order: true },
      });
      dto.sort_order = (max._max.sort_order || 0) + 1;
    }
    return this.prisma.fieldOption.create({ data: dto });
  }

  async update(id: number, dto: { label?: string; sort_order?: number; is_active?: boolean }) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');

    // If label is changed and it's a location, auto-sync references
    if (dto.label && dto.label !== existing.label && existing.category === 'location') {
      const oldLabel = existing.label;
      const primaryLabel = dto.label;

      const existingAliases: string[] = Array.isArray(existing.aliases)
        ? (existing.aliases as string[])
        : [];
      const newAliases: string[] = [...existingAliases];

      if (!newAliases.includes(oldLabel)) {
        newAliases.push(oldLabel);
      }

      return this.prisma.$transaction(async (tx) => {
        const updatedOption = await tx.fieldOption.update({
          where: { id },
          data: { ...dto, aliases: newAliases },
        });

        let updatedCount = 0;

        // work_logs
        updatedCount += (await tx.workLog.updateMany({
          where: { start_location: oldLabel },
          data: { start_location: primaryLabel },
        })).count;
        updatedCount += (await tx.workLog.updateMany({
          where: { end_location: oldLabel },
          data: { end_location: primaryLabel },
        })).count;

        // payroll_work_logs
        updatedCount += (await tx.payrollWorkLog.updateMany({
          where: { start_location: oldLabel },
          data: { start_location: primaryLabel },
        })).count;
        updatedCount += (await tx.payrollWorkLog.updateMany({
          where: { end_location: oldLabel },
          data: { end_location: primaryLabel },
        })).count;

        // verification_records
        updatedCount += (await tx.verificationRecord.updateMany({
          where: { record_location_from: oldLabel },
          data: { record_location_from: primaryLabel },
        })).count;
        updatedCount += (await tx.verificationRecord.updateMany({
          where: { record_location_to: oldLabel },
          data: { record_location_to: primaryLabel },
        })).count;

        // verification_wa_order_items
        updatedCount += (await tx.verificationWaOrderItem.updateMany({
          where: { wa_item_location: oldLabel },
          data: { wa_item_location: primaryLabel },
        })).count;

        // rate_cards
        updatedCount += (await tx.rateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        })).count;
        updatedCount += (await tx.rateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        })).count;

        // fleet_rate_cards
        updatedCount += (await tx.fleetRateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        })).count;
        updatedCount += (await tx.fleetRateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        })).count;

        // subcon_rate_cards
        updatedCount += (await tx.subconRateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        })).count;
        updatedCount += (await tx.subconRateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        })).count;

        this.logger.log(`Updated location label from ${oldLabel} to ${primaryLabel}. Synced ${updatedCount} records.`);
        return { ...updatedOption, updatedCount };
      });
    }

    return this.prisma.fieldOption.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    await this.prisma.fieldOption.delete({ where: { id } });
    return { success: true };
  }

  async reorder(category: string, orderedIds: number[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.prisma.fieldOption.update({
        where: { id: orderedIds[i] },
        data: { sort_order: i + 1 },
      });
    }
    return this.findByCategory(category);
  }

  /**
   * Bulk import labels for a given category.
   * Skips duplicates (case-insensitive match on trimmed label).
   * Returns counts of added and skipped items.
   */
  async bulkImport(category: string, labels: string[]): Promise<{ added: number; skipped: number; addedLabels: string[]; skippedLabels: string[] }> {
    const trimmed = labels.map(l => l.trim()).filter(l => l.length > 0);
    const unique = [...new Set(trimmed)];

    const existing = await this.prisma.fieldOption.findMany({
      where: { category },
      select: { label: true },
    });
    const existingSet = new Set(existing.map(e => e.label.trim().toLowerCase()));

    const toAdd = unique.filter(l => !existingSet.has(l.toLowerCase()));
    const skipped = unique.filter(l => existingSet.has(l.toLowerCase()));

    if (toAdd.length > 0) {
      const maxOrder = await this.prisma.fieldOption.aggregate({
        where: { category },
        _max: { sort_order: true },
      });
      const baseOrder = maxOrder._max.sort_order || 0;
      const data = toAdd.map((label, idx) => ({
        category,
        label,
        sort_order: baseOrder + idx + 1,
        is_active: true,
      }));
      await this.prisma.fieldOption.createMany({ data });
    }

    return { added: toAdd.length, skipped: skipped.length, addedLabels: toAdd, skippedLabels: skipped };
  }

  /**
   * Update the aliases array for a specific FieldOption.
   */
  async updateAliases(id: number, aliases: string[]) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');

    if (existing.category === 'location') {
      const existingAliases: string[] = Array.isArray(existing.aliases)
        ? (existing.aliases as string[])
        : [];
      
      const newAliases = aliases.filter(a => !existingAliases.includes(a));
      
      if (newAliases.length > 0) {
        const primaryLabel = existing.label;
        
        return this.prisma.$transaction(async (tx) => {
          const updatedOption = await tx.fieldOption.update({
            where: { id },
            data: { aliases },
          });

          let updatedCount = 0;

          for (const alias of newAliases) {
            // work_logs
            updatedCount += (await tx.workLog.updateMany({
              where: { start_location: alias },
              data: { start_location: primaryLabel },
            })).count;
            updatedCount += (await tx.workLog.updateMany({
              where: { end_location: alias },
              data: { end_location: primaryLabel },
            })).count;

            // payroll_work_logs
            updatedCount += (await tx.payrollWorkLog.updateMany({
              where: { start_location: alias },
              data: { start_location: primaryLabel },
            })).count;
            updatedCount += (await tx.payrollWorkLog.updateMany({
              where: { end_location: alias },
              data: { end_location: primaryLabel },
            })).count;

            // verification_records
            updatedCount += (await tx.verificationRecord.updateMany({
              where: { record_location_from: alias },
              data: { record_location_from: primaryLabel },
            })).count;
            updatedCount += (await tx.verificationRecord.updateMany({
              where: { record_location_to: alias },
              data: { record_location_to: primaryLabel },
            })).count;

            // verification_wa_order_items
            updatedCount += (await tx.verificationWaOrderItem.updateMany({
              where: { wa_item_location: alias },
              data: { wa_item_location: primaryLabel },
            })).count;

            // rate_cards
            updatedCount += (await tx.rateCard.updateMany({
              where: { origin: alias },
              data: { origin: primaryLabel },
            })).count;
            updatedCount += (await tx.rateCard.updateMany({
              where: { destination: alias },
              data: { destination: primaryLabel },
            })).count;

            // fleet_rate_cards
            updatedCount += (await tx.fleetRateCard.updateMany({
              where: { origin: alias },
              data: { origin: primaryLabel },
            })).count;
            updatedCount += (await tx.fleetRateCard.updateMany({
              where: { destination: alias },
              data: { destination: primaryLabel },
            })).count;

            // subcon_rate_cards
            updatedCount += (await tx.subconRateCard.updateMany({
              where: { origin: alias },
              data: { origin: primaryLabel },
            })).count;
            updatedCount += (await tx.subconRateCard.updateMany({
              where: { destination: alias },
              data: { destination: primaryLabel },
            })).count;
          }

          this.logger.log(`Added new aliases [${newAliases.join(', ')}] for location ${primaryLabel}. Synced ${updatedCount} records.`);
          return { ...updatedOption, updatedCount };
        });
      }
    }

    return this.prisma.fieldOption.update({
      where: { id },
      data: { aliases },
    });
  }

  /**
   * Merge multiple location options into one primary location.
   * - Saves merged names as aliases on the primary location
   * - Updates ALL tables that reference location strings:
   *     work_logs, payroll_work_logs, verification_records,
   *     verification_wa_order_items, rate_cards, fleet_rate_cards, subcon_rate_cards
   * - Deletes the merged FieldOption rows
   */
  async mergeLocations(dto: { primaryId: number; mergeIds: number[] }) {
    const { primaryId, mergeIds } = dto;

    if (!mergeIds || mergeIds.length === 0) {
      throw new NotFoundException('沒有選擇要合併的地點');
    }

    // Fetch primary option
    const primary = await this.prisma.fieldOption.findUnique({ where: { id: primaryId } });
    if (!primary) throw new NotFoundException('主地點不存在');
    if (primary.category !== 'location') throw new NotFoundException('只能合併地點類別');

    // Fetch all merge targets
    const targets = await this.prisma.fieldOption.findMany({
      where: { id: { in: mergeIds }, category: 'location' },
    });
    if (targets.length === 0) throw new NotFoundException('找不到要合併的地點');

    const targetLabels = targets.map(t => t.label);
    const primaryLabel = primary.label;

    // Collect existing aliases from primary + all merged targets
    const existingAliases: string[] = Array.isArray(primary.aliases)
      ? (primary.aliases as string[])
      : [];
    const newAliases: string[] = [...existingAliases];

    for (const target of targets) {
      // Add the target's label as alias (if not already the primary label or in aliases)
      if (target.label !== primaryLabel && !newAliases.includes(target.label)) {
        newAliases.push(target.label);
      }
      // Also carry over any existing aliases from the merged targets
      const targetAliases: string[] = Array.isArray(target.aliases)
        ? (target.aliases as string[])
        : [];
      for (const alias of targetAliases) {
        if (alias !== primaryLabel && !newAliases.includes(alias)) {
          newAliases.push(alias);
        }
      }
    }

    // Execute all updates in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Update primary location's aliases
      await tx.fieldOption.update({
        where: { id: primaryId },
        data: { aliases: newAliases },
      });

      for (const oldLabel of targetLabels) {
        // work_logs
        await tx.workLog.updateMany({
          where: { start_location: oldLabel },
          data: { start_location: primaryLabel },
        });
        await tx.workLog.updateMany({
          where: { end_location: oldLabel },
          data: { end_location: primaryLabel },
        });

        // payroll_work_logs
        await tx.payrollWorkLog.updateMany({
          where: { start_location: oldLabel },
          data: { start_location: primaryLabel },
        });
        await tx.payrollWorkLog.updateMany({
          where: { end_location: oldLabel },
          data: { end_location: primaryLabel },
        });

        // verification_records
        await tx.verificationRecord.updateMany({
          where: { record_location_from: oldLabel },
          data: { record_location_from: primaryLabel },
        });
        await tx.verificationRecord.updateMany({
          where: { record_location_to: oldLabel },
          data: { record_location_to: primaryLabel },
        });

        // verification_wa_order_items
        await tx.verificationWaOrderItem.updateMany({
          where: { wa_item_location: oldLabel },
          data: { wa_item_location: primaryLabel },
        });

        // rate_cards
        await tx.rateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        });
        await tx.rateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        });

        // fleet_rate_cards
        await tx.fleetRateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        });
        await tx.fleetRateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        });

        // subcon_rate_cards
        await tx.subconRateCard.updateMany({
          where: { origin: oldLabel },
          data: { origin: primaryLabel },
        });
        await tx.subconRateCard.updateMany({
          where: { destination: oldLabel },
          data: { destination: primaryLabel },
        });
      }

      // Delete the merged FieldOption rows (exclude primary)
      await tx.fieldOption.deleteMany({
        where: { id: { in: mergeIds } },
      });
    });

    return {
      success: true,
      primary: primaryLabel,
      merged: targetLabels,
      aliases: newAliases,
      message: `已將 ${targetLabels.join('、')} 合併至「${primaryLabel}」，並更新所有相關記錄。舊名稱已保留為別名。`,
    };
  }

  /**
   * 取得所有地點選項，並附上 work_logs 起點/終點欄位的使用次數。
   * 使用次數以未刪除 worklog 中 start_location 與 end_location 的出現次數加總計算。
   */
  async getLocationsWithUsage(query: LocationOptionsQueryDto): Promise<LocationUsageOptionDto[]> {
    const [locations, usageMap] = await Promise.all([
      this.prisma.fieldOption.findMany({ where: { category: 'location' } }),
      this.getLocationUsageCountsMap(),
    ]);

    const options = locations.map(location => {
      const usage = usageMap.get(this.normalizeExactLocation(location.label)) ?? { total: 0, start: 0, end: 0 };
      return this.toLocationUsageOptionDto(location, usage);
    });

    return this.sortLocationUsageOptions(options, query.sortBy, query.sortOrder);
  }

  /**
   * 找出疑似重複地點名稱，供前端快速勾選合併。
   */
  async findDuplicateLocations(query: FindDuplicateLocationsQueryDto): Promise<DuplicateLocationGroupDto[]> {
    const minSimilarity = query.minSimilarity ?? 0.82;
    const locations = await this.getLocationsWithUsage({
      sortBy: LocationOptionSortBy.Name,
      sortOrder: SortDirection.Asc,
    });

    const candidates = locations
      .map(location => ({
        ...location,
        normalized_label: this.normalizeLocationForDuplicateDetection(location.label),
      }))
      .filter(location => location.normalized_label.length > 0);

    if (candidates.length < 2) return [];

    const parent = candidates.map((_, index) => index);
    const find = (index: number): number => {
      if (parent[index] !== index) parent[index] = find(parent[index]);
      return parent[index];
    };
    const union = (left: number, right: number) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
    };

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const similarity = this.getLocationNameSimilarity(
          candidates[i].normalized_label,
          candidates[j].normalized_label,
        );
        if (similarity >= minSimilarity) union(i, j);
      }
    }

    const grouped = new Map<number, DuplicateLocationCandidateDto[]>();
    candidates.forEach((candidate, index) => {
      const root = find(index);
      const existing = grouped.get(root) ?? [];
      existing.push(candidate);
      grouped.set(root, existing);
    });

    const duplicateGroups: DuplicateLocationGroupDto[] = [];
    for (const locationsInGroup of grouped.values()) {
      if (locationsInGroup.length < 2) continue;

      const allSameNormalizedLabel = locationsInGroup.every(
        location => location.normalized_label === locationsInGroup[0].normalized_label,
      );
      const maxSimilarity = this.getMaxLocationGroupSimilarity(locationsInGroup);
      const sortedLocations = [...locationsInGroup].sort((a, b) => {
        const usageDiff = b.worklog_usage_count - a.worklog_usage_count;
        if (usageDiff !== 0) return usageDiff;
        return a.label.localeCompare(b.label, 'zh-HK');
      });

      duplicateGroups.push({
        groupKey: sortedLocations.map(location => location.id).join('-'),
        reason: allSameNormalizedLabel
          ? DuplicateLocationReason.ExactNormalizedMatch
          : DuplicateLocationReason.SimilarName,
        similarity: maxSimilarity,
        locations: sortedLocations,
      });
    }

    return duplicateGroups.sort((a, b) => {
      const usageA = a.locations.reduce((sum, location) => sum + location.worklog_usage_count, 0);
      const usageB = b.locations.reduce((sum, location) => sum + location.worklog_usage_count, 0);
      if (usageA !== usageB) return usageB - usageA;
      if (a.similarity !== b.similarity) return b.similarity - a.similarity;
      return a.locations[0].label.localeCompare(b.locations[0].label, 'zh-HK');
    });
  }

  private async getLocationUsageCountsMap(): Promise<Map<string, LocationUsageCount>> {
    const rows = await this.prisma.$queryRaw<LocationUsageCountRow[]>(Prisma.sql`
      SELECT
        location,
        SUM(start_count)::int AS start_count,
        SUM(end_count)::int AS end_count,
        SUM(start_count + end_count)::int AS usage_count
      FROM (
        SELECT
          BTRIM(start_location) AS location,
          COUNT(*)::int AS start_count,
          0::int AS end_count
        FROM work_logs
        WHERE deleted_at IS NULL
          AND start_location IS NOT NULL
          AND BTRIM(start_location) <> ''
        GROUP BY BTRIM(start_location)

        UNION ALL

        SELECT
          BTRIM(end_location) AS location,
          0::int AS start_count,
          COUNT(*)::int AS end_count
        FROM work_logs
        WHERE deleted_at IS NULL
          AND end_location IS NOT NULL
          AND BTRIM(end_location) <> ''
        GROUP BY BTRIM(end_location)
      ) usage
      GROUP BY location
    `);

    const usageMap = new Map<string, LocationUsageCount>();
    for (const row of rows) {
      usageMap.set(this.normalizeExactLocation(row.location), {
        total: Number(row.usage_count),
        start: Number(row.start_count),
        end: Number(row.end_count),
      });
    }
    return usageMap;
  }

  private toLocationUsageOptionDto(option: FieldOption, usage: LocationUsageCount): LocationUsageOptionDto {
    return {
      id: option.id,
      category: option.category,
      label: option.label,
      sort_order: option.sort_order,
      is_active: option.is_active,
      aliases: this.parseAliases(option.aliases),
      field_option_latitude: option.field_option_latitude,
      field_option_longitude: option.field_option_longitude,
      created_at: option.created_at,
      updated_at: option.updated_at,
      worklog_usage_count: usage.total,
      start_usage_count: usage.start,
      end_usage_count: usage.end,
    };
  }

  private sortLocationUsageOptions(
    options: LocationUsageOptionDto[],
    sortBy: LocationOptionSortBy = LocationOptionSortBy.Name,
    sortOrder: SortDirection = SortDirection.Asc,
  ): LocationUsageOptionDto[] {
    const direction = sortOrder === SortDirection.Desc ? -1 : 1;
    return [...options].sort((a, b) => {
      if (sortBy === LocationOptionSortBy.Usage) {
        const usageDiff = a.worklog_usage_count - b.worklog_usage_count;
        if (usageDiff !== 0) return usageDiff * direction;
      }

      const nameDiff = a.label.localeCompare(b.label, 'zh-HK');
      if (nameDiff !== 0) return nameDiff * direction;
      return (a.id - b.id) * direction;
    });
  }

  private parseAliases(aliases: Prisma.JsonValue): string[] {
    if (!Array.isArray(aliases)) return [];
    return aliases.filter((alias): alias is string => typeof alias === 'string');
  }

  private normalizeExactLocation(label: string): string {
    return label.trim();
  }

  private normalizeLocationForDuplicateDetection(label: string): string {
    return label
      .trim()
      .toLowerCase()
      .replace(/[\s\-_/\\.,，。()（）\[\]【】]+/g, '');
  }

  private getLocationNameSimilarity(left: string, right: string): number {
    if (left === right) return 1;
    if (left.length === 0 || right.length === 0) return 0;

    const sortedLeft = this.sortCharacters(left);
    const sortedRight = this.sortCharacters(right);
    if (left.length >= 3 && right.length >= 3 && sortedLeft === sortedRight) return 0.98;

    const maxLength = Math.max(left.length, right.length);
    const shorter = left.length < right.length ? left : right;
    const longer = left.length < right.length ? right : left;
    const editSimilarity = 1 - this.getLevenshteinDistance(left, right) / maxLength;

    if (shorter.length >= 3 && longer.includes(shorter)) {
      return Math.max(editSimilarity, shorter.length / longer.length);
    }

    return editSimilarity;
  }

  private getMaxLocationGroupSimilarity(locations: DuplicateLocationCandidateDto[]): number {
    let maxSimilarity = 0;
    for (let i = 0; i < locations.length; i++) {
      for (let j = i + 1; j < locations.length; j++) {
        maxSimilarity = Math.max(
          maxSimilarity,
          this.getLocationNameSimilarity(locations[i].normalized_label, locations[j].normalized_label),
        );
      }
    }
    return Number(maxSimilarity.toFixed(2));
  }

  private sortCharacters(value: string): string {
    return Array.from(value).sort().join('');
  }

  private getLevenshteinDistance(left: string, right: string): number {
    const leftChars = Array.from(left);
    const rightChars = Array.from(right);
    const previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);

    for (let i = 0; i < leftChars.length; i++) {
      const current = [i + 1];
      for (let j = 0; j < rightChars.length; j++) {
        const insertion = current[j] + 1;
        const deletion = previous[j + 1] + 1;
        const substitution = previous[j] + (leftChars[i] === rightChars[j] ? 0 : 1);
        current.push(Math.min(insertion, deletion, substitution));
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[rightChars.length];
  }

  /**
   * 更新 FieldOption 的 GPS 座標
   */
  async updateGps(id: number, dto: { field_option_latitude: number; field_option_longitude: number }) {
    const existing = await this.prisma.fieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選項不存在');
    return this.prisma.fieldOption.update({
      where: { id },
      data: {
        field_option_latitude: dto.field_option_latitude,
        field_option_longitude: dto.field_option_longitude,
      },
    });
  }

  /**
   * 取得所有 location 類別的 FieldOption（包含 GPS 座標資訊）
   */
  async getLocationsWithGps() {
    return this.prisma.fieldOption.findMany({
      where: { category: 'location', is_active: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * 合併多個客戶合約選項為一個主合約選項。
   * - 將被合併選項的名稱保存為主選項的別名
   * - 更新所有引用 client_contract_no 字串的表
   * - 刪除被合併的 FieldOption 行
   */
  async mergeContractOptions(dto: { primaryId: number; mergeIds: number[] }) {
    const { primaryId, mergeIds } = dto;

    if (!mergeIds || mergeIds.length === 0) {
      throw new BadRequestException('沒有選擇要合併的合約選項');
    }

    // Fetch primary option
    const primary = await this.prisma.fieldOption.findUnique({ where: { id: primaryId } });
    if (!primary) throw new NotFoundException('主合約選項不存在');
    if (primary.category !== 'client_contract_no') {
      throw new BadRequestException('只能合併客戶合約類別的選項');
    }

    // Fetch all merge targets
    const targets = await this.prisma.fieldOption.findMany({
      where: { id: { in: mergeIds }, category: 'client_contract_no' },
    });
    if (targets.length === 0) throw new NotFoundException('找不到要合併的合約選項');

    const targetLabels = targets.map(t => t.label);
    const primaryLabel = primary.label;

    // Collect existing aliases from primary + all merged targets
    const existingAliases: string[] = Array.isArray(primary.aliases)
      ? (primary.aliases as string[])
      : [];
    const newAliases: string[] = [...existingAliases];

    for (const target of targets) {
      if (target.label !== primaryLabel && !newAliases.includes(target.label)) {
        newAliases.push(target.label);
      }
      const targetAliases: string[] = Array.isArray(target.aliases)
        ? (target.aliases as string[])
        : [];
      for (const alias of targetAliases) {
        if (alias !== primaryLabel && !newAliases.includes(alias)) {
          newAliases.push(alias);
        }
      }
    }

    // Execute all updates in a single transaction
    await this.prisma.$transaction(async (tx) => {
      // Update primary option's aliases
      await tx.fieldOption.update({
        where: { id: primaryId },
        data: { aliases: newAliases },
      });

      for (const oldLabel of targetLabels) {
        // work_logs
        await tx.workLog.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // payroll_work_logs
        await tx.payrollWorkLog.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // fleet_rate_cards
        await tx.fleetRateCard.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // rate_cards
        await tx.rateCard.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // subcon_rate_cards
        await tx.subconRateCard.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // invoices
        await tx.invoice.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // projects
        await tx.project.updateMany({
          where: { client_contract_no: oldLabel },
          data: { client_contract_no: primaryLabel },
        });

        // daily_reports
        await tx.dailyReport.updateMany({
          where: { daily_report_client_contract_no: oldLabel },
          data: { daily_report_client_contract_no: primaryLabel },
        });

        // acceptance_reports
        await tx.acceptanceReport.updateMany({
          where: { acceptance_report_client_contract_no: oldLabel },
          data: { acceptance_report_client_contract_no: primaryLabel },
        });
      }

      // Delete the merged FieldOption rows (exclude primary)
      await tx.fieldOption.deleteMany({
        where: { id: { in: mergeIds } },
      });
    });

    return {
      success: true,
      primary: primaryLabel,
      merged: targetLabels,
      aliases: newAliases,
      message: `已將 ${targetLabels.join('、')} 合併至「${primaryLabel}」，並更新所有相關記錄。舊名稱已保留為別名。`,
    };
  }
}
