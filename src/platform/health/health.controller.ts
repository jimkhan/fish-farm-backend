import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { Public } from '../../shared-kernel/auth/public.decorator';

/** Shape of the `Health` schema in contracts/openapi.yaml (CON-047). */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  /** Per-dependency status, e.g. `{ db: 'ok' }`. */
  checks: Record<string, 'ok' | 'down'>;
}

/**
 * Liveness/readiness probe (CON-047, NFR-007/NFR-010). Public, unversioned. Used by container
 * orchestration and uptime monitoring. Pings the database on every call (cheap `SELECT 1`) and
 * reports `degraded` (still HTTP 200 — the process itself is alive) if it fails, without ever
 * throwing back to the caller.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const checks: Record<string, 'ok' | 'down'> = {};

    try {
      await this.dataSource.query('SELECT 1');
      checks.db = 'ok';
    } catch {
      checks.db = 'down';
    }

    const status = Object.values(checks).every((c) => c === 'ok') ? 'ok' : 'degraded';

    return {
      status,
      version: process.env.npm_package_version ?? '0.1.0',
      checks,
    };
  }
}
