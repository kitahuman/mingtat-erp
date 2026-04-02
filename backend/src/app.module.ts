import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
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
import { EmployeePortalModule } from './employee-portal/employee-portal.module';
import { AttendancesModule } from './attendances/attendances.module';
import { LeavesModule } from './leaves/leaves.module';
import { ContractsModule } from './contracts/contracts.module';
import { BqSectionsModule } from './bq-sections/bq-sections.module';
import { BqItemsModule } from './bq-items/bq-items.module';
import { VariationOrdersModule } from './variation-orders/variation-orders.module';
import { PaymentApplicationsModule } from './payment-applications/payment-applications.module';
import { PaymentInModule } from './payment-in/payment-in.module';
import { PaymentOutModule } from './payment-out/payment-out.module';
import { RetentionModule } from './retention/retention.module';
import { InvoicesModule } from './invoices/invoices.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { BankReconciliationModule } from './bank-reconciliation/bank-reconciliation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
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
    EmployeePortalModule,
    AttendancesModule,
    LeavesModule,
    ContractsModule,
    BqSectionsModule,
    BqItemsModule,
    VariationOrdersModule,
    PaymentApplicationsModule,
    PaymentInModule,
    PaymentOutModule,
    RetentionModule,
    InvoicesModule,
    BankAccountsModule,
    BankReconciliationModule,
  ],
})
export class AppModule {}
