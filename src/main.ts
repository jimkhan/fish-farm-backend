import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { StructuredLogger } from './shared-kernel/logging/structured-logger';

async function bootstrap(): Promise<void> {
  // Buffer framework logs until the structured logger (which needs ConfigService) is attached,
  // so even Nest's own boot messages come out in the configured shape rather than two formats.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);

  // Validate and shape every request body at the presentation boundary (CLAUDE.md §5).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  Logger.log(
    {
      msg: `Listening on :${port}`,
      event: 'app.started',
      port,
      nodeEnv: config.get<string>('NODE_ENV'),
      logLevel: logger.level,
      logFormat: logger.format,
    },
    'Bootstrap',
  );
}

// Fail fast: any boot/config error (e.g. a missing required env var, AC-002) exits non-zero
// so the process/orchestrator does not run in a half-configured state.
bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // eslint-disable-next-line no-console
  console.error(`[bootstrap] fatal: ${message}`);
  process.exit(1);
});
