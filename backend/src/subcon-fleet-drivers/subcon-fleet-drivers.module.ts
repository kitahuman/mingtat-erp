import { Module } from '@nestjs/common';
import { SubconFleetDriversController } from './subcon-fleet-drivers.controller';
import { SubconFleetDriversService } from './subcon-fleet-drivers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SubconFleetDriversController],
  providers: [SubconFleetDriversService],
  exports: [SubconFleetDriversService],
})
export class SubconFleetDriversModule {}
