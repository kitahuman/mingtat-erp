import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({}),
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
