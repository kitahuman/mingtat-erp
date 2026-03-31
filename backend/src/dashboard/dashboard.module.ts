import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/company.entity';
import { Employee } from '../employees/employee.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Machinery } from '../machinery/machinery.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { CompanyProfilesModule } from '../company-profiles/company-profiles.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company, Employee, Vehicle, Machinery, CompanyProfile]),
    CompanyProfilesModule,
    CustomFieldsModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
