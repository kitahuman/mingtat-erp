import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Machinery } from './machinery.entity';
import { MachineryTransfer } from './machinery-transfer.entity';
import { MachineryService } from './machinery.service';
import { MachineryController } from './machinery.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Machinery, MachineryTransfer])],
  providers: [MachineryService],
  controllers: [MachineryController],
  exports: [MachineryService],
})
export class MachineryModule {}
