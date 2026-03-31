import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkLog } from './work-log.entity';
import { WorkLogsService } from './work-logs.service';
import { WorkLogsController } from './work-logs.controller';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';
import { RateCard } from '../rate-cards/rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkLog, Vehicle, Machinery, RateCard, CompanyProfile])],
  controllers: [WorkLogsController],
  providers: [WorkLogsService],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
