import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { Payroll } from './payroll.entity';
import { PayrollItem } from './payroll-item.entity';
import { PayrollWorkLog } from './payroll-work-log.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';
import { Employee } from '../employees/employee.entity';
import { EmployeeSalarySetting } from '../employees/employee-salary-setting.entity';
import { WorkLog } from '../work-logs/work-log.entity';
import { FleetRateCard } from '../fleet-rate-cards/fleet-rate-card.entity';
import { CompanyProfile } from '../company-profiles/company-profile.entity';
import { RateCard } from '../rate-cards/rate-card.entity';
import { Partner } from '../partners/partner.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payroll,
      PayrollItem,
      PayrollWorkLog,
      PayrollAdjustment,
      Employee,
      EmployeeSalarySetting,
      WorkLog,
      FleetRateCard,
      CompanyProfile,
      RateCard,
      Partner,
    ]),
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
