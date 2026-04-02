import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';

@Module({
  imports: [PrismaModule],
  providers: [ContractsService],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
