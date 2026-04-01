import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';

@Module({
  imports: [PrismaModule],
  providers: [PartnersService],
  controllers: [PartnersController],
  exports: [PartnersService],
})
export class PartnersModule {}
