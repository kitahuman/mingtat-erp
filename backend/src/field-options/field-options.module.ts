import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FieldOptionsService } from './field-options.service';
import { FieldOptionsController } from './field-options.controller';

@Module({
  imports: [PrismaModule],
  providers: [FieldOptionsService],
  controllers: [FieldOptionsController],
  exports: [FieldOptionsService],
})
export class FieldOptionsModule {}
