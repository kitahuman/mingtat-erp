/**
 * Upload Proxy API Route
 *
 * 解決問題：Next.js rewrites 在代理 multipart/form-data 時，會先將整個 request body
 * 緩衝到記憶體再轉發，導致 busboy 收到不完整的 multipart body，拋出
 * "Multipart: Unexpected end of form" 錯誤。
 *
 * 此 API Route 使用 Next.js App Router 的 Request API，直接將原始 body stream
 * 轉發到後端，保留 Content-Type（含 boundary）和 Content-Length，
 * 確保 multipart 解析正確。
 *
 * 使用方式：前端上傳改為 POST /api/upload-proxy?path=/employee-portal/daily-reports/upload
 */

import { NextRequest, NextResponse } from 'next/server';

// Next.js 14 App Router 不需要額外禁用 body parser，預設就不會緩衝請求 body
// 後端 URL（server-side 可用 container 內部網路名稱）
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3001';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ message: '缺少 path 參數' }, { status: 400 });
    }

    // 白名單：只允許代理特定的上傳路徑，防止 SSRF
    const ALLOWED_UPLOAD_PATHS = [
      '/employee-portal/daily-reports/upload',
      '/employee-portal/upload-photo',
      '/employee-portal/acceptance-reports/upload',
      '/daily-reports/upload',
      '/acceptance-reports/upload',
    ];

    if (!ALLOWED_UPLOAD_PATHS.some((allowed) => path.startsWith(allowed))) {
      return NextResponse.json({ message: '不允許的上傳路徑' }, { status: 403 });
    }

    const targetUrl = `${BACKEND_URL}/api${path}`;

    // 複製請求 headers，保留 Content-Type（含 multipart boundary）和 Authorization
    const forwardHeaders = new Headers();
    const contentType = request.headers.get('content-type');
    if (contentType) {
      forwardHeaders.set('content-type', contentType);
    }
    const authorization = request.headers.get('authorization');
    if (authorization) {
      forwardHeaders.set('authorization', authorization);
    }
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      forwardHeaders.set('content-length', contentLength);
    }

    // 直接串流轉發 body，不緩衝
    const backendResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: request.body,
      // @ts-expect-error - Node.js fetch 需要此設定才能串流 body
      duplex: 'half',
    });

    const responseData = await backendResponse.json();

    return NextResponse.json(responseData, {
      status: backendResponse.status,
    });
  } catch (error) {
    console.error('[upload-proxy] Error:', error);
    return NextResponse.json(
      { message: '上傳代理發生錯誤，請重試' },
      { status: 500 },
    );
  }
}
