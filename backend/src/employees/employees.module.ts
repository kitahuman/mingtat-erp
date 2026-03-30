import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './employee.entity';
import { EmployeeSalarySetting } from './employee-salary-setting.entity';
import { EmployeeTransfer } from './employee-transfer.entity';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, EmployeeSalarySetting, EmployeeTransfer])],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
