import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../shared-kernel/errors/domain-error';
import { TenantContext } from '../../../shared-kernel/tenant/tenant-context';
import { WaterParameter, WaterReading } from '../domain/water-reading.entity';
import {
  WATER_READING_REPOSITORY,
  WaterReadingRepositoryPort,
} from './ports/water-reading-repository.port';

export interface IngestSensorInput {
  readonly pondId: string;
  readonly deviceId: string;
  readonly parameter: WaterParameter;
  readonly value: number;
  readonly readAt: Date;
}

/**
 * `POST /devices/{deviceId}/readings` (CON-044, FT-037/F6, AC-089, R6). Persists a `source=SENSOR`
 * reading for the **device's own project** — `projectId` comes from `TenantContext`, which the
 * `DeviceKeyGuard` populated from the resolved device row (never from the URL or payload), and the
 * scoped `WaterReadingRepository` re-stamps `project_id` from it on save, so a device can only
 * ever write to its own project. `pondId`/`deviceId` likewise come from the device row.
 *
 * Unlike `RecordReadingUseCase`, this path does **not** currently run threshold breach-evaluation /
 * publish `WaterThresholdBreached`: AC-089 covers storage + auth + isolation only, and wiring
 * sensor readings into the alert engine would mean sharing `RecordReadingUseCase`'s breach block
 * (a change that ripples into that reviewed use-case). Left as a documented follow-up — sensor
 * readings are stored and queryable, but do not yet raise threshold alerts the way manual readings
 * do (a real consistency gap, flagged rather than silently shipped).
 */
@Injectable()
export class IngestSensorUseCase {
  constructor(
    @Inject(WATER_READING_REPOSITORY) private readonly readings: WaterReadingRepositoryPort,
    private readonly tenant: TenantContext,
  ) {}

  async execute(input: IngestSensorInput): Promise<WaterReading> {
    if (!Number.isFinite(input.value)) {
      throw new ValidationError('Invalid sensor value.');
    }

    const reading = WaterReading.reconstitute({
      id: randomUUID(),
      projectId: this.tenant.projectId,
      pondId: input.pondId,
      parameter: input.parameter,
      value: input.value,
      source: 'SENSOR',
      deviceId: input.deviceId,
      readAt: input.readAt,
      // Sensor telemetry carries no client idempotency key (CON-044's SensorReading has none), so
      // a server-generated id makes each post a distinct row — a duplicate reading is harmless.
      clientMutationId: randomUUID(),
      createdAt: new Date(),
    });

    return this.readings.save(reading);
  }
}
