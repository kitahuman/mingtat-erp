import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationService } from './verification.service';
import { OcrService } from './ocr.service';
import { GpsService } from './gps.service';
import { VerificationController } from './verification.controller';

@Module({
  imports: [PrismaModule],
  providers: [VerificationService, OcrService, GpsService],
  controllers: [VerificationController],
  exports: [VerificationService, OcrService, GpsService],
})
export class VerificationModule {}
