import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectProfitLossService } from './project-profit-loss.service';
import { ProjectProfitLossController } from './project-profit-loss.controller';

@Module({
  imports: [PrismaModule],
  providers: [ProjectProfitLossService],
  controllers: [ProjectProfitLossController],
  exports: [ProjectProfitLossService],
})
export class ProjectProfitLossModule {}
