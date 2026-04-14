import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AttendancesService } from './attendances.service';
import { AttendanceMatchingService } from './attendance-matching.service';
import { AttendancesController } from './attendances.controller';

@Module({
  imports: [PrismaModule],
  providers: [AttendancesService, AttendanceMatchingService],
  controllers: [AttendancesController],
  exports: [AttendancesService, AttendanceMatchingService],
})
export class AttendancesModule {}
