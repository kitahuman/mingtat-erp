import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationService } from './verification.service';
import { OcrService } from './ocr.service';
import { GpsService } from './gps.service';
import { WhatsappService } from './whatsapp.service';
import { MatchingService } from './matching.service';
import { VerificationController } from './verification.controller';
import { WhatsappController } from './whatsapp.controller';
import { MatchingController } from './matching.controller';
import { NicknameMatchService } from './nickname-match.service';

@Module({
  imports: [PrismaModule],
  providers: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, NicknameMatchService],
  controllers: [VerificationController, WhatsappController, MatchingController],
  exports: [VerificationService, OcrService, GpsService, WhatsappService, MatchingService, NicknameMatchService],
})
export class VerificationModule {}
