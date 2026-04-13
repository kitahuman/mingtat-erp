import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const startTime = Date.now();
    let dbStatus: 'ok' | 'error' = 'error';
    let dbLatencyMs: number | null = null;
    let dbError: string | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - startTime;
      dbStatus = 'ok';
    } catch (err: any) {
      dbError = err?.message ?? 'Unknown database error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        ...(dbError ? { error: dbError } : {}),
      },
    };
  }
}
