import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecycleBinService } from './recycle-bin.service';
import { RecycleBinController } from './recycle-bin.controller';

@Module({
  imports: [PrismaModule],
  providers: [RecycleBinService],
  controllers: [RecycleBinController],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
