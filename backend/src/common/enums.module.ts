import { Module } from '@nestjs/common';
import { EnumsController } from './enums.controller';
import { FieldOptionsModule } from '../field-options/field-options.module';

@Module({
  imports: [FieldOptionsModule],
  controllers: [EnumsController],
})
export class EnumsModule {}
