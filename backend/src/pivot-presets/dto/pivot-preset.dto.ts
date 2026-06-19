import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * pvp_config JSON 結構，對應 SummaryTab 的 state。
 * 後端僅做基本驗證（必須是物件），詳細欄位由前端負責序列化/反序列化。
 */
export class PivotPresetConfigDto {
  @IsOptional()
  @IsArray()
  rowFields?: string[];

  @IsOptional()
  @IsArray()
  colFields?: string[];

  @IsOptional()
  @IsArray()
  valueTypes?: string[];

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsArray()
  companyIds?: string[];

  @IsOptional()
  @IsArray()
  clientIds?: string[];

  @IsOptional()
  @IsArray()
  employeeIds?: string[];

  @IsOptional()
  @IsArray()
  equipmentNumbers?: string[];

  @IsOptional()
  @IsArray()
  selectedMachineTypes?: string[];

  @IsOptional()
  @IsArray()
  startLocations?: string[];

  @IsOptional()
  @IsArray()
  endLocations?: string[];

  @IsOptional()
  @IsArray()
  selectedContracts?: string[];

  @IsOptional()
  @IsArray()
  selectedQuotations?: string[];

  @IsOptional()
  @IsArray()
  selectedDayNights?: string[];

  @IsOptional()
  @IsArray()
  selectedServiceTypes?: string[];

  @IsOptional()
  @IsArray()
  selectedStatuses?: string[];
}

export class CreatePivotPresetDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsObject()
  config: PivotPresetConfigDto;
}

export class UpdatePivotPresetDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: PivotPresetConfigDto;
}

export class SaveLastUsedDto {
  @IsObject()
  config: PivotPresetConfigDto;
}
