import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { CompanyProfilesModule } from '../company-profiles/company-profiles.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [PrismaModule, CompanyProfilesModule, CustomFieldsModule, VerificationModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
