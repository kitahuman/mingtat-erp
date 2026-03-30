import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './vehicle.entity';
import { VehiclePlateHistory } from './vehicle-plate-history.entity';
import { VehicleTransfer } from './vehicle-transfer.entity';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, VehiclePlateHistory, VehicleTransfer])],
  providers: [VehiclesService],
  controllers: [VehiclesController],
  exports: [VehiclesService],
})
export class VehiclesModule {}
