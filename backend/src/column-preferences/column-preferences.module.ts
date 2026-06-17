import { Module } from '@nestjs/common';
import { ColumnPreferencesController } from './column-preferences.controller';
import { ColumnPreferencesService } from './column-preferences.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ColumnPreferencesController],
  providers: [ColumnPreferencesService],
})
export class ColumnPreferencesModule {}
