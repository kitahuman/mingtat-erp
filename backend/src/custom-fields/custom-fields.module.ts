import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';

@Module({
  imports: [PrismaModule],
  providers: [CustomFieldsService],
  controllers: [CustomFieldsController],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
