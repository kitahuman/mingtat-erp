import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';

@Module({
  imports: [PrismaModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
