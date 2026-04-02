import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyProfitLossService } from './company-profit-loss.service';
import { CompanyProfitLossController } from './company-profit-loss.controller';

@Module({
  imports: [PrismaModule],
  providers: [CompanyProfitLossService],
  controllers: [CompanyProfitLossController],
  exports: [CompanyProfitLossService],
})
export class CompanyProfitLossModule {}
