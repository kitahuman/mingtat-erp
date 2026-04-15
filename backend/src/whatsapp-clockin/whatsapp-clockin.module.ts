import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappClockinController } from './whatsapp-clockin.controller';
import { WhatsappClockinService } from './whatsapp-clockin.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsappClockinController],
  providers: [WhatsappClockinService],
  exports: [WhatsappClockinService],
})
export class WhatsappClockinModule {}
