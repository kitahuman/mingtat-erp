import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompanyClockController } from './company-clock.controller';
import { CompanyClockService } from './company-clock.service';
import { FaceRecognitionService } from './face-recognition.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'default-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [CompanyClockController],
  providers: [CompanyClockService, FaceRecognitionService],
})
export class CompanyClockModule {}
