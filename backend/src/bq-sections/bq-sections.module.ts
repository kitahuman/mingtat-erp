import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BqSectionsService } from './bq-sections.service';
import { BqSectionsController } from './bq-sections.controller';

@Module({
  imports: [PrismaModule],
  providers: [BqSectionsService],
  controllers: [BqSectionsController],
  exports: [BqSectionsService],
})
export class BqSectionsModule {}
