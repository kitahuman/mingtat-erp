import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from './company-profile.entity';
import { CompanyProfilesService } from './company-profiles.service';
import { CompanyProfilesController } from './company-profiles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile])],
  providers: [CompanyProfilesService],
  controllers: [CompanyProfilesController],
  exports: [CompanyProfilesService],
})
export class CompanyProfilesModule {}
