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
import { DailyReportVerificationService } from './daily-report-verification.service';

@Module({
  imports: [PrismaModule, WhatsappClockinModule],
  providers: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, ConfirmationService, NicknameMatchService, DailyReportVerificationService],
  controllers: [VerificationController, WhatsappController, MatchingController, ConfirmationController],
  exports: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, ConfirmationService, NicknameMatchService, DailyReportVerificationService],
})
export class VerificationModule {}
