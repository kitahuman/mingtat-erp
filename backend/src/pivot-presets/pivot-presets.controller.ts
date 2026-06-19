import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PivotPresetsService } from './pivot-presets.service';
import {
  CreatePivotPresetDto,
  UpdatePivotPresetDto,
  SaveLastUsedDto,
} from './dto/pivot-preset.dto';

interface JwtUser {
  id?: number;
  userId?: number;
  sub?: number | string;
}

interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

function getUserId(req: AuthenticatedRequest): number {
  const raw = req.user?.id ?? req.user?.userId ?? req.user?.sub;
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(parsed) ? parsed : 0;
}

@Controller('pivot-presets')
@UseGuards(AuthGuard('jwt'))
export class PivotPresetsController {
  constructor(private service: PivotPresetsService) {}

  /** GET /pivot-presets — 取得當前用戶所有視圖（含 is_last） */
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.service.list(getUserId(req));
  }

  /** POST /pivot-presets — 新增命名視圖 */
  @Post()
  async create(
    @Body() dto: CreatePivotPresetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(getUserId(req), dto);
  }

  /**
   * PUT /pivot-presets/last-used — 保存/更新「上次設定」（upsert，pvp_is_last=true）
   * 注意：此路由必須定義在 PUT /:id 之前，避免 'last-used' 被當成 id。
   */
  @Put('last-used')
  async saveLastUsed(
    @Body() dto: SaveLastUsedDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveLastUsed(getUserId(req), dto);
  }

  /** PUT /pivot-presets/:id — 更新視圖 */
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePivotPresetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(getUserId(req), id, dto);
  }

  /** DELETE /pivot-presets/:id — 刪除視圖 */
  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.remove(getUserId(req), id);
  }
}
