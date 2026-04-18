import { Global, Module } from '@nestjs/common';
import { ErrorLogsController } from './error-logs.controller';
import { ErrorLogsService } from './error-logs.service';

@Global()
@Module({
  controllers: [ErrorLogsController],
  providers: [ErrorLogsService],
  exports: [ErrorLogsService],
})
export class ErrorLogsModule {}
