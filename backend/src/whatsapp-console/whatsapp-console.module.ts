import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappConsoleController } from './whatsapp-console.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappConsoleService } from './whatsapp-console.service';
import { WebPushService } from './web-push.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WhatsappConsoleController, WhatsappWebhookController],
  providers: [WhatsappConsoleService, WebPushService],
  exports: [WhatsappConsoleService, WebPushService],
})
export class WhatsappConsoleModule {}
