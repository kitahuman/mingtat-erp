import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiActivityLogService } from './ai-activity-log.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AiActivityLogService],
  exports: [AiActivityLogService],
})
export class AiActivityLogModule {}
