import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

// Set up global SOCKS5 proxy for OpenAI API calls (bypasses HK geo-restriction)
if (process.env.SOCKS_PROXY_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SocksProxyAgent } = require('socks-proxy-agent');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https = require('https');
  const agent = new SocksProxyAgent(process.env.SOCKS_PROXY_URL);
  https.globalAgent = agent;
  console.log(`[Proxy] Global HTTPS agent set to SOCKS5: ${process.env.SOCKS_PROXY_URL}`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });

  // Increase body size limit for base64 image uploads
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  // Serve uploaded files as static assets
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const defaultOrigins = [
    'https://mingtat-erp-web.onrender.com',
    'http://localhost:3000',
  ];

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : defaultOrigins;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend running on port ${port}`);
}
bootstrap();
