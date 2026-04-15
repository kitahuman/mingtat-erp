import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappClockinModule } from '../whatsapp-clockin/whatsapp-clockin.module';
import { VerificationService } from './verification.service';
import { OcrService } from './ocr.service';
import { GpsService } from './gps.service';
import { WhatsappService } from './whatsapp.service';
import { MatchingService } from './matching.service';
import { ConfirmationService } from './confirmation.service';
import { VerificationController } from './verification.controller';
import { WhatsappController } from './whatsapp.controller';
import { MatchingController } from './matching.controller';
import { ConfirmationController } from './confirmation.controller';
import { NicknameMatchService } from './nickname-match.service';

@Module({
  imports: [PrismaModule, WhatsappClockinModule],
  providers: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, ConfirmationService, NicknameMatchService],
  controllers: [VerificationController, WhatsappController, MatchingController, ConfirmationController],
  exports: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, ConfirmationService, NicknameMatchService],
})
export class VerificationModule {}
