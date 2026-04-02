import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProjectProfitLossService } from './project-profit-loss.service';

@Controller('project-profit-loss')
@UseGuards(AuthGuard('jwt'))
export class ProjectProfitLossController {
  constructor(private readonly service: ProjectProfitLossService) {}

  // GET /project-profit-loss/overview
  // Overview of all projects P&L
  @Get('overview')
  getOverview(
    @Query('status') status?: string,
    @Query('sort_by') sortBy?: string,
    @Query('sort_order') sortOrder?: string,
  ) {
    return this.service.getOverview({
      status,
      sort_by: sortBy,
      sort_order: sortOrder,
    });
  }

  // GET /project-profit-loss/:projectId
  // Detailed P&L for a single project
  @Get(':projectId')
  getProjectProfitLoss(
    @Param('projectId') projectId: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.service.getProjectProfitLoss(+projectId, dateFrom, dateTo);
  }
}
