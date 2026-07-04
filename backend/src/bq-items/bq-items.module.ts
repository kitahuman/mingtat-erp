import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BqItemsService } from './bq-items.service';
import { BqImportService } from './bq-import.service';
import { BqItemsController } from './bq-items.controller';

@Module({
  imports: [PrismaModule],
  providers: [BqItemsService, BqImportService],
  controllers: [BqItemsController],
  exports: [BqItemsService],
})
export class BqItemsModule {}
