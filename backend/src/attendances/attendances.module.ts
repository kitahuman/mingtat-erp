import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendancesService } from './attendances.service';
import { AttendanceMatchingService } from './attendance-matching.service';
import { AttendanceToWorkLogService } from './attendance-to-worklog.service';
import { AttendancesController } from './attendances.controller';
import { AttendanceAutoConvertService } from './attendance-auto-convert.service';

@Module({
  imports: [PrismaModule],
  providers: [AttendancesService, AttendanceMatchingService, AttendanceToWorkLogService, AttendanceAutoConvertService],
  controllers: [AttendancesController],
  exports: [AttendancesService, AttendanceMatchingService, AttendanceToWorkLogService],
})
export class AttendancesModule {}
