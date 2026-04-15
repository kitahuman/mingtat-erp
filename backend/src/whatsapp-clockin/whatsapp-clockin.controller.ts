import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { WhatsappClockinService, ParsedClockIn } from './whatsapp-clockin.service';

interface ClockInResponse {
  success: boolean;
  workLogIds?: number[];
  parsed?: ParsedClockIn;
  error?: string;
}

@Controller('whatsapp-clockin')
export class WhatsappClockinController {
  private readonly logger = new Logger(WhatsappClockinController.name);

  constructor(private readonly service: WhatsappClockinService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleClockIn(
    @Headers('x-webhook-secret') webhookSecret: string,
    @Body() body: { chatId: string; sender: string; text: string; groupName?: string },
  ): Promise<ClockInResponse> {
    // 驗證 webhook secret
    const expectedSecret = process.env.WHATSAPP_CLOCKIN_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      this.logger.warn('Invalid webhook secret received');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    this.logger.log(
      `Received clock-in from group=${body.chatId}, sender=${body.sender}, text=${(body.text || '').substring(0, 50)}...`,
    );

    const result = await this.service.processClockIn(body);

    return {
      success: result.success,
      workLogIds: result.workLogIds,
      parsed: result.parsed,
      error: result.error,
    };
  }
}
