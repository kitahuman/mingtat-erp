import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MachineryService } from './machinery.service';
import { MachineryController } from './machinery.controller';

@Module({
  imports: [PrismaModule],
  providers: [MachineryService],
  controllers: [MachineryController],
  exports: [MachineryService],
})
export class MachineryModule {}
