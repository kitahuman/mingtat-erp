import { Controller, Get } from '@nestjs/common';
import {
  UNIT_OPTIONS, SERVICE_TYPE_OPTIONS,
  VEHICLE_TONNAGE_OPTIONS, VEHICLE_TYPE_OPTIONS,
} from './enums';

@Controller('enums')
export class EnumsController {
  @Get()
  getAll() {
    return {
      units: UNIT_OPTIONS,
      service_types: SERVICE_TYPE_OPTIONS,
      vehicle_tonnages: VEHICLE_TONNAGE_OPTIONS,
      vehicle_types: VEHICLE_TYPE_OPTIONS,
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
    };
  }
}
