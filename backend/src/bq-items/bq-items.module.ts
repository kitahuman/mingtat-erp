import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BqItemsService } from './bq-items.service';
import { BqItemsController } from './bq-items.controller';

@Module({
  imports: [PrismaModule],
  providers: [BqItemsService],
  controllers: [BqItemsController],
  exports: [BqItemsService],
})
export class BqItemsModule {}
