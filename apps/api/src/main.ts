import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/filters/http-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const prefix = process.env.API_PREFIX ?? 'api';
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const port = Number(process.env.API_PORT ?? 4000);

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || process.env.NODE_ENV !== 'production') {
        callback(null, true);
        return;
      }
      const allowed = new Set([webOrigin, ...extraOrigins]);
      callback(null, allowed.has(origin));
    },
    credentials: true,
  });
  app.useGlobalFilters(new HttpErrorFilter());

  await app.listen(port);
  Logger.log(`Al-Khal API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
