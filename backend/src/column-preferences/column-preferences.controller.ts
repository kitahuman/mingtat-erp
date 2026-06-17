import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ColumnPreferencesService } from './column-preferences.service';
import { SaveColumnPreferenceDto } from './column-preferences.dto';

@Controller('column-preferences')
@UseGuards(AuthGuard('jwt'))
export class ColumnPreferencesController {
  constructor(private service: ColumnPreferencesService) {}

  /** GET /column-preferences/:pageKey — get preference for current user */
  @Get(':pageKey')
  async get(@Param('pageKey') pageKey: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.service.get(pageKey, userId);
  }

  /** PUT /column-preferences/:pageKey — save personal preference */
  @Put(':pageKey')
  async savePersonal(
    @Param('pageKey') pageKey: string,
    @Body() dto: SaveColumnPreferenceDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    return this.service.savePersonal(pageKey, userId, dto);
  }

  /** PUT /column-preferences/:pageKey/default — save global default (admin only) */
  @Put(':pageKey/default')
  async saveDefault(
    @Param('pageKey') pageKey: string,
    @Body() dto: SaveColumnPreferenceDto,
    @Req() req: any,
  ) {
    if (req.user.role !== 'admin') {
      throw new ForbiddenException('只有管理員可以設定全域預設欄位');
    }
    return this.service.saveDefault(pageKey, dto);
  }

  /** DELETE /column-preferences/:pageKey — reset personal preference */
  @Delete(':pageKey')
  async resetPersonal(@Param('pageKey') pageKey: string, @Req() req: any) {
    const userId = req.user.sub;
    return this.service.resetPersonal(pageKey, userId);
  }
}
