import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';

@Module({
  imports: [PrismaModule],
  providers: [QuotationsService],
  controllers: [QuotationsController],
  exports: [QuotationsService],
})
export class QuotationsModule {}
