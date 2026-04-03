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
    // Flush headers immediately so the client knows the stream has started
    res.flushHeaders?.();

    console.log('[AI Chat] Request received, messages count:', messages?.length ?? 0);

    try {
      const currentMessages = [...(messages || [])];
      const maxToolCalls = 5;

      for (let round = 0; round < maxToolCalls; round++) {
        console.log(`[AI Chat] Round ${round + 1}: calling OpenAI with ${currentMessages.length} messages`);

        const stream = await this.service.chat(currentMessages);

        let assistantContent = '';
        // Use a plain object map to avoid sparse-array issues
        const toolCallMap: Record<number, { id: string; function: { name: string; arguments: string } }> = {};

        // ── Stream the response chunk by chunk ──────────────────────────
        for await (const chunk of stream) {
          const choice = (chunk as any).choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          const finishReason = choice.finish_reason;

          // Stream text content to the client immediately
          if (delta?.content) {
            assistantContent += delta.content;
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          }

          // Accumulate tool_calls deltas
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx: number = tc.index ?? 0;
              if (!toolCallMap[idx]) {
                toolCallMap[idx] = { id: '', function: { name: '', arguments: '' } };
              }
              if (tc.id) toolCallMap[idx].id = tc.id;
              if (tc.function?.name) toolCallMap[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCallMap[idx].function.arguments += tc.function.arguments;
            }
          }

          // When the model signals it's done with tool calls, we can break early
          if (finishReason === 'stop') {
            console.log(`[AI Chat] Round ${round + 1}: finish_reason=stop, no more tool calls`);
            break;
          }
        }

        const toolCallsList = Object.values(toolCallMap);
        console.log(`[AI Chat] Round ${round + 1}: assistantContent length=${assistantContent.length}, toolCalls=${toolCallsList.length}`);

        // ── No tool calls → final answer, exit loop ──────────────────────
        if (toolCallsList.length === 0) {
          console.log(`[AI Chat] Round ${round + 1}: no tool calls, done`);
          break;
        }

        // ── Has tool calls → execute them and continue the loop ──────────
        // Push the assistant's tool-call message into history
        currentMessages.push({
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCallsList.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });

        // Execute each tool and push results
        for (const tc of toolCallsList) {
          console.log(`[AI Chat] Executing tool: ${tc.function.name}, args: ${tc.function.arguments}`);
          res.write(`data: ${JSON.stringify({ tool_call: tc.function.name })}\n\n`);

          let toolResult: any;
          try {
            toolResult = await this.service.handleToolCall(tc);
            console.log(`[AI Chat] Tool ${tc.function.name} succeeded`);
          } catch (toolError: any) {
            console.error(`[AI Chat] Tool ${tc.function.name} error:`, toolError?.message);
            toolResult = { error: toolError?.message || 'Tool execution failed' };
          }

          currentMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        // Continue to next round to get the final AI response
      }

      res.write('data: [DONE]\n\n');
      res.end();
      console.log('[AI Chat] Request completed successfully');
    } catch (error: any) {
      console.error('[AI Chat] Fatal error:', error?.message);
      console.error('[AI Chat] Error status:', error?.status);
      console.error('[AI Chat] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

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

      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
}
