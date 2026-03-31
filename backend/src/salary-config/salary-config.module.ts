import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { Employee } from '../employees/employee.entity';
import { SalaryConfigService } from './salary-config.service';
import { SalaryConfigController } from './salary-config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeSalarySetting, Employee])],
  providers: [SalaryConfigService],
  controllers: [SalaryConfigController],
  exports: [SalaryConfigService],
})
export class SalaryConfigModule {}
