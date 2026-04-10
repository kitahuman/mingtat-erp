import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as nodeFetch from 'node-fetch';

/**
 * Creates an OpenAI client with optional HTTP proxy support via node-fetch.
 * When HTTPS_PROXY env var is set, all requests will be routed through the proxy.
 * This is required for environments where direct OpenAI access is geo-blocked (e.g., Hong Kong AWS ap-east-1).
 */
export function createOpenAIClient(apiKey?: string, baseURL?: string): OpenAI {
  const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY || '';
  const resolvedBaseURL = baseURL || process.env.OPENAI_BASE_URL || undefined;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    return new OpenAI({
      apiKey: resolvedApiKey,
      ...(resolvedBaseURL ? { baseURL: resolvedBaseURL } : {}),
      fetch: (url, init) => {
        return nodeFetch.default(url as any, { ...(init as any), agent }) as any;
      },
    });
  }

  return new OpenAI({
    apiKey: resolvedApiKey,
    ...(resolvedBaseURL ? { baseURL: resolvedBaseURL } : {}),
  });
}
