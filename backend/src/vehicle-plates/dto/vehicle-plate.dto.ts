import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVehiclePlateDto {
  @IsString()
  @IsNotEmpty()
  plate_number: string;

  @Type(() => Number)
  @IsNumber()
  owner_company_id: number;

  @IsOptional()
  @IsString()
  plate_owned_date?: string;

  @IsOptional()
  @IsString()
  plate_expiry_date?: string;

  @IsOptional()
  @IsString()
  plate_notes?: string;
}

export class AssignVehiclePlateDto {
  @Type(() => Number)
  @IsNumber()
  vehicle_id: number;

  @IsString()
  assigned_date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferVehiclePlateDto {
  @Type(() => Number)
  @IsNumber()
  from_company_id: number;

  @Type(() => Number)
  @IsNumber()
  to_company_id: number;

  @IsString()
  transfer_date: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ManualPlateAssignmentHistoryDto {
  @Type(() => Number)
  @IsNumber()
  vehicle_id: number;

  @IsString()
  assigned_date: string;

  @IsOptional()
  @IsString()
  removed_date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ManualPlateTransferHistoryDto extends TransferVehiclePlateDto {}
  
export class UpdateVehiclePlateDto {
  @IsOptional()
  @IsString()
  plate_expiry_date?: string | null;

  @IsOptional()
  @IsString()
  plate_owned_date?: string | null;

  @IsOptional()
  @IsString()
  plate_notes?: string | null;
}
