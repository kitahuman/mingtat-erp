import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/company.entity';
import { Employee } from '../employees/employee.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, Employee, Vehicle, Machinery])],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
