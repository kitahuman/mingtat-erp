import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AiActivityStatus = 'success' | 'error';

export interface AiActivityLogInput {
  module: string;
  action: string;
  status: AiActivityStatus;
  inputSummary?: string | null;
  outputSummary?: string | null;
  tokensUsed?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | number | null;
  type?: string;
  description?: string;
  reason?: string | null;
  confidence?: number | null;
  entityType?: string | null;
  entityId?: number | null;
}

@Injectable()
export class AiActivityLogService {
  private readonly logger = new Logger(AiActivityLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AiActivityLogInput): Promise<void> {
    try {
      const metadata = this.compactObject({
        ...(input.metadata ?? {}),
        tokens_used: input.tokensUsed ?? undefined,
        duration_ms: input.durationMs ?? undefined,
        error_message: input.errorMessage ?? undefined,
        created_by: typeof input.createdBy === 'string' ? input.createdBy : undefined,
      });

      await this.prisma.aiActivityLog.create({
        data: {
          activity_module_code: input.module,
          activity_type: input.type ?? 'ai_operation',
          activity_action: input.action,
          activity_description:
            input.description ??
            `${input.module}.${input.action} ${input.status === 'success' ? '完成' : '失敗'}`,
          activity_reason: input.reason ?? input.errorMessage ?? undefined,
          activity_input_summary: this.truncate(input.inputSummary, 4000),
          activity_output_summary: this.truncate(input.outputSummary, 4000),
          activity_result: input.status,
          activity_confidence:
            typeof input.confidence === 'number'
              ? new Prisma.Decimal(input.confidence)
              : undefined,
          activity_knowledge_gained:
            Object.keys(metadata).length > 0
              ? (metadata as Prisma.InputJsonValue)
              : undefined,
          activity_entity_type: input.entityType ?? undefined,
          activity_entity_id: input.entityId ?? undefined,
          activity_user_id:
            typeof input.createdBy === 'number' ? input.createdBy : undefined,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to write AI activity log: ${message}`);
    }
  }

  private truncate(value?: string | null, maxLength = 4000): string | undefined {
    if (!value) return undefined;
    return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
  }

  private compactObject(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined && item !== null),
    );
  }
}
