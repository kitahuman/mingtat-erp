import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WhatsappService } from './whatsapp.service';

// ══════════════════════════════════════════════════════════════
// WhatsApp Webhook Controller
// POST /api/verification/whatsapp-webhook — 不需要 JWT，用 webhook secret 驗證
// GET/POST 其他端點 — 需要 JWT 認證
// ══════════════════════════════════════════════════════════════

@Controller('verification')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  // ── Webhook 端點（不需要 JWT）──────────────────────────────
  @Post('whatsapp-webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() body: { chatId: string; sender: string; text: string; groupName?: string },
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    const expectedSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'mingtat-wa-webhook-2026';
    if (webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    if (!body.text || !body.sender) {
      return { processed: false, reason: 'missing_required_fields' };
    }

    return this.whatsappService.processWebhookMessage({
      chatId: body.chatId || '',
      sender: body.sender,
      text: body.text,
      groupName: body.groupName,
    });
  }

  // ── 每日 Order 總結列表（主要 API）─────────────────────────
  @Get('whatsapp-daily-summaries')
  @UseGuards(AuthGuard('jwt'))
  async getDailySummaries(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsappService.getDailySummaries({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    });
  }

  // ── 單日 Order 總結詳情 ────────────────────────────────────
  @Get('whatsapp-daily-summary/:date')
  @UseGuards(AuthGuard('jwt'))
  async getDailySummary(@Param('date') date: string) {
    return this.whatsappService.getDailySummary(date);
  }

  // ── WhatsApp Orders 列表（保留向後兼容）─────────────────────
  @Get('whatsapp-orders')
  @UseGuards(AuthGuard('jwt'))
  async getOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
    @Query('search') search?: string,
  ) {
    return this.whatsappService.getWhatsappOrders({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      date_from: dateFrom,
      date_to: dateTo,
      search,
    });
  }

  // ── WhatsApp Order 詳情（保留向後兼容）──────────────────────
  @Get('whatsapp-orders/:id')
  @UseGuards(AuthGuard('jwt'))
  async getOrderDetail(@Param('id') id: string) {
    return this.whatsappService.getWhatsappOrderDetail(+id);
  }

  // ── WhatsApp Messages 列表（需要 JWT）───────────────────────
  @Get('whatsapp-messages')
  @UseGuards(AuthGuard('jwt'))
  async getMessages(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('classification') classification?: string,
  ) {
    return this.whatsappService.getWhatsappMessages({
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      classification,
    });
  }
}
