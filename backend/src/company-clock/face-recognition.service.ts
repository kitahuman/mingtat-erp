import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

export interface FaceComparisonResult {
  isSamePerson: boolean;
  similarityScore: number;
  confidence: string;
  explanation: string;
}

@Injectable()
export class FaceRecognitionService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[FaceRecognitionService] OPENAI_API_KEY is not set!');
    } else {
      console.log('[FaceRecognitionService] OPENAI_API_KEY loaded, prefix:', apiKey.substring(0, 7) + '...');
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Compare two face images using GPT-4.1 Vision API.
   * @param standardPhotoBase64 - The standard/reference photo (data URI or raw base64)
   * @param capturedPhotoBase64 - The newly captured photo (data URI or raw base64)
   * @returns FaceComparisonResult with similarity score and verdict
   */
  async compareFaces(
    standardPhotoBase64: string,
    capturedPhotoBase64: string,
  ): Promise<FaceComparisonResult> {
    // Ensure both images have proper data URI format
    const standardUri = this.ensureDataUri(standardPhotoBase64);
    const capturedUri = this.ensureDataUri(capturedPhotoBase64);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: `你是一個專業的人臉識別助手。你的任務是比較兩張照片中的人臉，判斷是否為同一人。
請仔細觀察面部特徵，包括：臉型、眼睛、鼻子、嘴巴、耳朵、眉毛等。
考慮到拍攝角度、光線、表情可能不同，但核心面部特徵應該一致。
注意：工地環境拍攝，可能戴安全帽或口罩，請盡量從可見特徵判斷。

請返回以下 JSON 格式（不要加 markdown 代碼塊標記）：
{
  "is_same_person": true/false,
  "similarity_score": 0-100,
  "confidence": "high" | "medium" | "low",
  "explanation": "簡短說明判斷依據"
}

similarity_score 說明：
- 90-100: 非常確定是同一人
- 70-89: 很可能是同一人
- 50-69: 不確定，需要人工確認
- 0-49: 很可能不是同一人

is_same_person 的判斷標準：similarity_score >= 70 時為 true`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '請比較以下兩張照片中的人臉，判斷是否為同一人。第一張是標準照（已存檔），第二張是剛拍攝的照片。',
              },
              {
                type: 'image_url',
                image_url: {
                  url: standardUri,
                  detail: 'high',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: capturedUri,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseComparisonResponse(content);
    } catch (error: any) {
      console.error('[FaceRecognitionService] GPT Vision API error:', error.message);
      throw new BadRequestException(`人臉比對失敗: ${error.message}`);
    }
  }

  /**
   * Ensure the base64 string has a proper data URI prefix.
   */
  private ensureDataUri(base64: string): string {
    if (base64.startsWith('data:')) {
      return base64;
    }
    // Default to JPEG if no prefix
    return `data:image/jpeg;base64,${base64}`;
  }

  /**
   * Parse the GPT response into a FaceComparisonResult.
   */
  private parseComparisonResponse(content: string): FaceComparisonResult {
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      return {
        isSamePerson: parsed.is_same_person === true,
        similarityScore: Number(parsed.similarity_score) || 0,
        confidence: parsed.confidence || 'low',
        explanation: parsed.explanation || '',
      };
    } catch {
      console.warn('[FaceRecognitionService] Failed to parse GPT response:', content);
      return {
        isSamePerson: false,
        similarityScore: 0,
        confidence: 'low',
        explanation: '無法解析 AI 回應',
      };
    }
  }
}
