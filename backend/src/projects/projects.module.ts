import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectCostRatesService } from './project-cost-rates.service';
import { ProjectCostRatesController } from './project-cost-rates.controller';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  providers: [ProjectsService, ProjectCostRatesService],
  controllers: [ProjectsController, ProjectCostRatesController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
