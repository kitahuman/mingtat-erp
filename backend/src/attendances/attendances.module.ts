import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendancesService } from './attendances.service';
import { AttendanceMatchingService } from './attendance-matching.service';
import { AttendanceToWorkLogService } from './attendance-to-worklog.service';
import { AttendancesController } from './attendances.controller';

@Module({
  imports: [PrismaModule],
  providers: [AttendancesService, AttendanceMatchingService, AttendanceToWorkLogService],
  controllers: [AttendancesController],
  exports: [AttendancesService, AttendanceMatchingService, AttendanceToWorkLogService],
})
export class AttendancesModule {}
