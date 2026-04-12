import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StatutoryHolidaysService } from './statutory-holidays.service';
import { StatutoryHolidaysController } from './statutory-holidays.controller';

@Module({
  imports: [PrismaModule],
  providers: [StatutoryHolidaysService],
  controllers: [StatutoryHolidaysController],
  exports: [StatutoryHolidaysService],
})
export class StatutoryHolidaysModule {}
