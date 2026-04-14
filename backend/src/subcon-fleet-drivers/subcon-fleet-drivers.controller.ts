import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SubconFleetDriversService } from './subcon-fleet-drivers.service';
import { AuthGuard } from '@nestjs/passport';
import { CreateSubconFleetDriverDto, UpdateSubconFleetDriverDto } from './dto/create-subcon-fleet-driver.dto';
import { SubconFleetDriverQueryDto } from './dto/subcon-fleet-driver-query.dto';
import {
  CreateNicknameMappingDto,
  UpdateNicknameMappingDto,
  NicknameMappingQueryDto,
} from './dto/nickname-mapping.dto';

@Controller('subcon-fleet-drivers')
@UseGuards(AuthGuard('jwt'))
export class SubconFleetDriversController {
  constructor(private readonly service: SubconFleetDriversService) {}

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get('simple-drivers')
  simpleDrivers() {
    return this.service.simpleDrivers();
  }

  // ── Nickname Mappings ──────────────────────────────────────

  @Get('nickname-mappings')
  findAllNicknameMappings(@Query() query: NicknameMappingQueryDto) {
    return this.service.findAllNicknameMappings(query);
  }

  @Post('nickname-mappings')
  createNicknameMapping(@Body() dto: CreateNicknameMappingDto) {
    return this.service.createNicknameMapping(dto);
  }

  @Put('nickname-mappings/:mappingId')
  updateNicknameMapping(
    @Param('mappingId', ParseIntPipe) mappingId: number,
    @Body() dto: UpdateNicknameMappingDto,
  ) {
    return this.service.updateNicknameMapping(mappingId, dto);
  }

  @Delete('nickname-mappings/:mappingId')
  removeNicknameMapping(@Param('mappingId', ParseIntPipe) mappingId: number) {
    return this.service.removeNicknameMapping(mappingId);
  }

  // ── Fleet Driver CRUD ──────────────────────────────────────

  @Get()
  findAll(@Query() query: SubconFleetDriverQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/detail')
  findOneDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOneDetail(id);
  }

  @Post()
  create(@Body() dto: CreateSubconFleetDriverDto, @Request() req: any) {
    return this.service.create(dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSubconFleetDriverDto, @Request() req: any) {
    return this.service.update(id, dto, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.service.remove(id, req.user?.id || req.user?.userId || 0, req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || undefined);
  }
}
