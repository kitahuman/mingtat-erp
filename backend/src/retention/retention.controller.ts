import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RetentionService } from './retention.service';
import { CreateRetentionReleaseDto } from './dto/retention.dto';

@Controller('contracts/:contractId/retention')
@UseGuards(AuthGuard('jwt'))
export class RetentionController {
  constructor(private readonly service: RetentionService) {}

  // Get retention summary for a contract
  @Get()
  getSummary(@Param('contractId') contractId: string) {
    return this.service.getSummary(+contractId);
  }

  // Sync retention tracking from IPA data
  @Post('sync')
  syncFromIpa(@Param('contractId') contractId: string) {
    return this.service.syncFromIpa(+contractId);
  }

  // Create retention release
  @Post('release')
  createRelease(
    @Param('contractId') contractId: string,
    @Body() body: CreateRetentionReleaseDto,
  ) {
    return this.service.createRelease(+contractId, body);
  }

  // Delete retention release
  @Delete('release/:releaseId')
  deleteRelease(
    @Param('contractId') contractId: string,
    @Param('releaseId') releaseId: string,
  ) {
    return this.service.deleteRelease(+contractId, +releaseId);
  }
}
