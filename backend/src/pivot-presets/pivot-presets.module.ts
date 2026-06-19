import { Module } from '@nestjs/common';
import { PivotPresetsController } from './pivot-presets.controller';
import { PivotPresetsService } from './pivot-presets.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PivotPresetsController],
  providers: [PivotPresetsService],
})
export class PivotPresetsModule {}
