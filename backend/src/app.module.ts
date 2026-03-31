import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get('DATABASE_URL');
        if (databaseUrl) {
          return {
            type: 'postgres',
            url: databaseUrl,
            autoLoadEntities: true,
            synchronize: true,
            ssl: { rejectUnauthorized: false },
          };
        }
        return {
          type: 'postgres',
          host: config.get('DATABASE_HOST', 'localhost'),
          port: config.get<number>('DATABASE_PORT', 5432),
          username: config.get('DATABASE_USER', 'mingtat'),
          password: config.get('DATABASE_PASSWORD', 'mingtat2026'),
          database: config.get('DATABASE_NAME', 'mingtat_erp'),
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),
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
  ],
})
export class AppModule {}
