import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { EmployeesModule } from './employees/employees.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { MachineryModule } from './machinery/machinery.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentsModule } from './documents/documents.module';
import { PartnersModule } from './partners/partners.module';
import { CompanyProfilesModule } from './company-profiles/company-profiles.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotationsModule } from './quotations/quotations.module';
import { RateCardsModule } from './rate-cards/rate-cards.module';
import { FleetRateCardsModule } from './fleet-rate-cards/fleet-rate-cards.module';
import { SubconRateCardsModule } from './subcon-rate-cards/subcon-rate-cards.module';
import { SalaryConfigModule } from './salary-config/salary-config.module';
import { EnumsModule } from './common/enums.module';
import { WorkLogsModule } from './work-logs/work-logs.module';
import { FieldOptionsModule } from './field-options/field-options.module';
import { PayrollModule } from './payroll/payroll.module';
import { CsvImportModule } from './csv-import/csv-import.module';
import { SubconFleetDriversModule } from './subcon-fleet-drivers/subcon-fleet-drivers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    EmployeesModule,
    VehiclesModule,
    MachineryModule,
    DashboardModule,
    DocumentsModule,
    PartnersModule,
    CompanyProfilesModule,
    CustomFieldsModule,
    ProjectsModule,
    QuotationsModule,
    RateCardsModule,
    FleetRateCardsModule,
    SubconRateCardsModule,
    SalaryConfigModule,
    EnumsModule,
    WorkLogsModule,
    FieldOptionsModule,
    PayrollModule,
    CsvImportModule,
    SubconFleetDriversModule,
    ExpensesModule,
    ExpenseCategoriesModule,
  ],
})
export class AppModule {}
