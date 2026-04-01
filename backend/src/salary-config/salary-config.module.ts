import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalaryConfigService } from './salary-config.service';
import { SalaryConfigController } from './salary-config.controller';

@Module({
  imports: [PrismaModule],
  providers: [SalaryConfigService],
  controllers: [SalaryConfigController],
  exports: [SalaryConfigService],
})
export class SalaryConfigModule {}
