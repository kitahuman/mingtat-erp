import { IsInt, IsOptional, IsString, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查詢打卡配對詳情 DTO
 */
export class AttendanceMatchQueryDto {
  @Type(() => Number)
  @IsInt()
  work_log_id: number;
}

/**
 * 搜尋員工當天打卡記錄（手動配對用）
 */
export class AttendanceSearchDto {
  @Type(() => Number)
  @IsInt()
  employee_id: number;

  @IsString()
  date: string; // YYYY-MM-DD
}

/**
 * 更新 field_option GPS 座標 DTO
 */
export class UpdateFieldOptionGpsDto {
  @Type(() => Number)
  @IsInt()
  id: number;

  @Type(() => Number)
  @IsNumber()
  field_option_latitude: number;

  @Type(() => Number)
  @IsNumber()
  field_option_longitude: number;
}

/**
 * 異常記錄查詢 DTO
 */
export class AnomalyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;

  @IsOptional()
  @IsString()
  @IsIn(['no_work_log', 'no_attendance', 'shift_mismatch', 'location_mismatch'])
  anomaly_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @IsString()
  @IsIn(['all', 'resolved', 'unresolved'])
  status?: string;
}

/**
 * 標記異常為已處理 DTO
 */
export class ResolveAnomalyDto {
  @IsOptional()
  @IsString()
  anomaly_resolved_notes?: string;
}

/**
 * 掃描異常記錄 DTO
 */
export class ScanAnomaliesDto {
  @IsString()
  date_from: string;

  @IsString()
  date_to: string;
}
