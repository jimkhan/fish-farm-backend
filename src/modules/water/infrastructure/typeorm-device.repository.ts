import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../domain/device.entity';
import { DeviceRepositoryPort } from '../application/ports/device-repository.port';
import { DevicePersistenceModel } from './persistence/device.persistence-model';
import { toDomain, toPersistence } from './persistence/device.mapper';

/**
 * Plain, **unscoped** `Repository` (not `ScopedRepository`) — device authentication resolves the
 * device before any tenant scope exists, so the lookup can't be filtered by `project_id`. Same
 * shape as `TypeOrmRefreshTokenRepository`.
 */
@Injectable()
export class TypeOrmDeviceRepository implements DeviceRepositoryPort {
  constructor(
    @InjectRepository(DevicePersistenceModel)
    private readonly repository: Repository<DevicePersistenceModel>,
  ) {}

  async findById(id: string): Promise<Device | null> {
    const model = await this.repository.findOne({ where: { id } });
    return model ? toDomain(model) : null;
  }

  async save(device: Device): Promise<Device> {
    const saved = await this.repository.save(toPersistence(device));
    return toDomain(saved);
  }
}
