import { Controller, Post, Body, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiChatService } from './ai-chat.service';
import type { Response } from 'express';

@Controller('ai-chat')
@UseGuards(AuthGuard('jwt'))
export class AiChatController {
  constructor(private readonly service: AiChatService) {}

  @Post()
  async chat(@Body('messages') messages: any[], @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    console.log('[AI Chat] Request received, messages count:', messages?.length ?? 0);

    try {
      const currentMessages = [...(messages || [])];
      let toolCallCount = 0;
      const maxToolCalls = 5;

      while (toolCallCount < maxToolCalls) {
        const stream = await this.service.chat(currentMessages);
        let assistantMessage = '';
        const toolCalls: any[] = [];

        for await (const chunk of stream) {
          const delta = (chunk as any).choices[0]?.delta;
          if (delta?.content) {
            assistantMessage += delta.content;
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id, function: { name: '', arguments: '' } };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        if (toolCalls.length > 0) {
          const toolCallResults: any[] = [];
          const assistantToolCallMessage = {
            role: 'assistant',
            content: assistantMessage || null,
            tool_calls: toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: tc.function,
            })),
          };
          currentMessages.push(assistantToolCallMessage);

          for (const tc of toolCalls) {
            console.log('[AI Chat] Calling tool:', tc.function.name);
            res.write(`data: ${JSON.stringify({ tool_call: tc.function.name })}\n\n`);
            try {
              const result = await this.service.handleToolCall(tc);
              toolCallResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            } catch (toolError: any) {
              console.error('[AI Chat] Tool call error:', tc.function.name, toolError?.message);
              toolCallResults.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify({ error: toolError?.message || 'Tool execution failed' }),
              });
            }
          }
          currentMessages.push(...toolCallResults);
          toolCallCount++;
        } else {
          break;
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
      console.log('[AI Chat] Request completed successfully');
    } catch (error: any) {
      console.error('[AI Chat] Fatal error:', error?.message);
      console.error('[AI Chat] Error type:', error?.constructor?.name);
      console.error('[AI Chat] Error status:', error?.status);
      console.error('[AI Chat] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

      let errorMsg = 'AI 服務暫時不可用，請稍後再試。';

      // Distinguish OpenAI API errors from other errors
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

      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
}
