import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { Employee } from '../employees/employee.entity';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { WorkLog } from '../work-logs/work-log.entity';
import { FleetRateCard } from '../fleet-rate-cards/fleet-rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payroll,
      PayrollItem,
      Employee,
      EmployeeSalarySetting,
      WorkLog,
      FleetRateCard,
      CompanyProfile,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
