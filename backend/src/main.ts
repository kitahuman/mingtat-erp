import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

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
    bufferLogs: true,
  });

  // M-08: Use pino as the application logger
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('Bootstrap');

  // Increase body size limit for base64 image uploads
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });

  // Serve uploaded files as static assets
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  // M-13: CORS — use CORS_ORIGIN env var; remove deprecated Render.com domain
  const defaultOrigins = [
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

  // M-07: Global exception filter — hide stack traces in production, unified error format
  app.useGlobalFilters(new AllExceptionsFilter());

  // H-05: ValidationPipe with whitelist — strip unknown properties, reject non-whitelisted
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  // M-18: Swagger API documentation — available at /api/docs
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('MingTat ERP API')
      .setDescription('明達 ERP 系統 API 文檔 — 包含所有後端端點的互動式文檔')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: '輸入 JWT Token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', '認證相關')
      .addTag('employees', '員工管理')
      .addTag('work-logs', '工作紀錄')
      .addTag('payroll', '薪酬管理')
      .addTag('invoices', '發票管理')
      .addTag('quotations', '報價管理')
      .addTag('contracts', '合約管理')
      .addTag('verification', '核實與匹配')
      .addTag('health', '健康檢查')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
      },
    });
    logger.log('Swagger API docs available at /api/docs');
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Backend running on port ${port}`);
}
bootstrap();
