import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SystemSettingsService, SettingItem } from './system-settings.service';

@Controller('system-settings')
@UseGuards(AuthGuard('jwt'))
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  /** GET /system-settings — return all settings as key-value map */
  @Get()
  getAll() {
    return this.service.getAll();
  }

  /** PUT /system-settings — bulk upsert settings */
  @Put()
  setMany(@Body() body: { settings: SettingItem[] }) {
    return this.service.setMany(body.settings);
  }
}
