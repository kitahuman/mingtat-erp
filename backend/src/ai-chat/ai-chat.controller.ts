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

    try {
      const currentMessages = [...messages];
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
            res.write(`data: ${JSON.stringify({ tool_call: tc.function.name })}\n\n`);
            const result = await this.service.handleToolCall(tc);
            toolCallResults.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }
          currentMessages.push(...toolCallResults);
          toolCallCount++;
        } else {
          break;
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('AI Chat Error:', error);
      res.write(`data: ${JSON.stringify({ error: 'AI 服務暫時不可用，請稍後再試。' })}\n\n`);
      res.end();
    }
  }
}
