import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('version')
@SkipThrottle()
export class VersionController {
  @Get()
  getVersion() {
    const commitSha = process.env.COMMIT_SHA || 'development';
    const deployedAt =
      process.env.DEPLOYED_AT || new Date().toISOString();
    return { commitSha, deployedAt };
  }
}
