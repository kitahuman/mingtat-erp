import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyProfilesService } from './company-profiles.service';
import { CompanyProfilesController } from './company-profiles.controller';

@Module({
  imports: [PrismaModule],
  providers: [CompanyProfilesService],
  controllers: [CompanyProfilesController],
  exports: [CompanyProfilesService],
})
export class CompanyProfilesModule {}
