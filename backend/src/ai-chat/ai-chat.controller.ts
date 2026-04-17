import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiChatService } from './ai-chat.service';
import { DirectorWritable } from '../auth/director-writable.decorator';

@Controller('ai-chat')
@UseGuards(AuthGuard('jwt'))
export class AiChatController {
  constructor(private readonly service: AiChatService) {}

  @Post()
  @DirectorWritable()
  async chat(@Body('messages') messages: any[]) {
    console.log('[AI Chat] Request received, messages count:', messages?.length ?? 0);

    try {
      const result = await this.service.chatWithTools(messages || []);
      console.log('[AI Chat] Request completed successfully');
      return result;
    } catch (error: any) {
      console.error('[AI Chat] Fatal error:', error?.message);
      console.error('[AI Chat] Error status:', error?.status);

      let errorMsg = 'AI 服務暫時不可用，請稍後再試。';
      if (error?.status === 401 || error?.response?.status === 401) {
        errorMsg = 'OpenAI API 認證失敗，請聯絡系統管理員檢查 API Key。';
        console.error('[AI Chat] OpenAI 401: API Key may be invalid or missing');
      } else if (error?.status === 429 || error?.response?.status === 429) {
        errorMsg = 'OpenAI API 請求過於頻繁，請稍後再試。';
      } else if (error?.status === 503 || error?.response?.status === 503) {
        errorMsg = 'OpenAI 服務暫時不可用，請稍後再試。';
      } else if (error?.message) {
        errorMsg = `錯誤：${error.message}`;
      }

      return { reply: `❌ ${errorMsg}`, tool_calls: [] };
    }
  }
}
