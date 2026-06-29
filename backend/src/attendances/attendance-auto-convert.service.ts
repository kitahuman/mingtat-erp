import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceToWorkLogService } from './attendance-to-worklog.service';

@Injectable()
export class AttendanceAutoConvertService {
  private readonly logger = new Logger(AttendanceAutoConvertService.name);

  constructor(private readonly attendanceToWorkLogService: AttendanceToWorkLogService) {}

  /**
   * 每天凌晨 2:00 HKT（即 UTC 18:00）自動將前一天的出勤記錄轉換為工作日誌。
   * Cron expression: '0 18 * * *' = 每天 18:00 UTC = 02:00 HKT (UTC+8)
   */
  @Cron('0 18 * * *')
  async handleDailyAttendanceConversion(): Promise<void> {
    const yesterday = this.getYesterdayInHkt();
    this.logger.log(`[AutoConvert] 開始自動轉換出勤記錄，日期：${yesterday}`);

    try {
      const result = await this.attendanceToWorkLogService.convertToWorkLog({
        date_from: yesterday,
        date_to: yesterday,
        dryRun: false,
      });

      this.logger.log(
        `[AutoConvert] 轉換完成 — 日期：${yesterday}，已建立：${result.created}，已略過：${result.skipped}，候選總數：${result.totalCandidates}`,
      );
    } catch (error) {
      this.logger.error(
        `[AutoConvert] 轉換失敗 — 日期：${yesterday}，錯誤：${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * 使用 HKT 時區計算昨天的日期字串（格式：YYYY-MM-DD）。
   * 必須使用 toLocaleString 配合 Asia/Hong_Kong 時區，避免 UTC 偏移問題。
   */
  private getYesterdayInHkt(): string {
    const nowHkt = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' }),
    );
    nowHkt.setDate(nowHkt.getDate() - 1);
    const year = nowHkt.getFullYear();
    const month = String(nowHkt.getMonth() + 1).padStart(2, '0');
    const day = String(nowHkt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
