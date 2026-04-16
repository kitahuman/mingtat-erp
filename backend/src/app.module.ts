import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { throttlerConfig } from './common/throttler.config';
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
import { ProjectProfitLossModule } from './project-profit-loss/project-profit-loss.module';
import { CompanyProfitLossModule } from './company-profit-loss/company-profit-loss.module';
import { SubconPayrollModule } from './subcon-payroll/subcon-payroll.module';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { VerificationModule } from './verification/verification.module';
import { GeoModule } from './geo/geo.module';
import { CompanyClockModule } from './company-clock/company-clock.module';
import { DailyReportsModule } from './daily-reports/daily-reports.module';
import { DailyReportStatsModule } from './daily-report-stats/daily-report-stats.module';
import { AcceptanceReportsModule } from './acceptance-reports/acceptance-reports.module';
import { WhatsappClockinModule } from './whatsapp-clockin/whatsapp-clockin.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { RecycleBinModule } from './recycle-bin/recycle-bin.module';
import { StatutoryHolidaysModule } from './statutory-holidays/statutory-holidays.module';
import { HealthModule } from './health/health.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { EquipmentProfitModule } from './equipment-profit/equipment-profit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot(throttlerConfig),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        autoLogging: {
          ignore: (req: any) => req.url === '/api/health',
        },
        serializers: {
          req: (req: any) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.remoteAddress,
          }),
          res: (res: any) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    AiChatModule,
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
    ProjectProfitLossModule,
    CompanyProfitLossModule,
    SubconPayrollModule,
    VerificationModule,
    GeoModule,
    CompanyClockModule,
    DailyReportsModule,
    DailyReportStatsModule,
    AcceptanceReportsModule,
    WhatsappClockinModule,
    AuditLogsModule,
    StatutoryHolidaysModule,
    RecycleBinModule,
    HealthModule,
    SystemSettingsModule,
    EquipmentProfitModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
