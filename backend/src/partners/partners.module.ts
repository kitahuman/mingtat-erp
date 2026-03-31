import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Partner } from './partner.entity';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Partner])],
  providers: [PartnersService],
  controllers: [PartnersController],
  exports: [PartnersService],
})
export class PartnersModule {}
