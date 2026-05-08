import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { VehiclePlatesController } from './vehicle-plates.controller';
import { VehiclePlatesService } from './vehicle-plates.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [VehiclePlatesController],
  providers: [VehiclePlatesService],
  exports: [VehiclePlatesService],
})
export class VehiclePlatesModule {}
