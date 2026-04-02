import { Controller, Get } from '@nestjs/common';
import {
  UNIT_OPTIONS, SERVICE_TYPE_OPTIONS,
  VEHICLE_TONNAGE_OPTIONS, VEHICLE_TYPE_OPTIONS,
  EXPENSE_SOURCE_OPTIONS, EXPENSE_CATEGORY_TYPE_OPTIONS,
} from './enums';
import { FieldOptionsService } from '../field-options/field-options.service';

@Controller('enums')
export class EnumsController {
  constructor(private readonly fieldOptionsService: FieldOptionsService) {}

  @Get()
  async getAll() {
    // Try to get vehicle_types from configurable field options first
    let vehicleTypes = VEHICLE_TYPE_OPTIONS;
    try {
      const opts = await this.fieldOptionsService.findByCategory('vehicle_type');
      if (opts && opts.length > 0) {
        vehicleTypes = opts.filter(o => o.is_active).map(o => o.label);
      }
    } catch {}

    return {
      units: UNIT_OPTIONS,
      service_types: SERVICE_TYPE_OPTIONS,
      vehicle_tonnages: VEHICLE_TONNAGE_OPTIONS,
      vehicle_types: vehicleTypes,
      quotation_statuses: [
        { value: 'draft', label: '草稿' },
        { value: 'sent', label: '已發送' },
        { value: 'accepted', label: '已接受' },
        { value: 'rejected', label: '已拒絕' },
      ],
      day_night_options: ['日', '夜'],
      salary_types: [
        { value: 'daily', label: '日薪制' },
        { value: 'monthly', label: '月薪制' },
      ],
      expense_sources: EXPENSE_SOURCE_OPTIONS,
      expense_category_types: EXPENSE_CATEGORY_TYPE_OPTIONS,
    };
  }
}
