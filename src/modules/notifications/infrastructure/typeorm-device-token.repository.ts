import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from '../domain/device-token.entity';
import { DeviceTokenRepositoryPort } from '../application/ports/device-token-repository.port';
import { toDomain, toPersistence } from './persistence/device-token.mapper';
import { DeviceTokenPersistenceModel } from './persistence/device-token.persistence-model';

/** Unscoped by project (user-owned) — see `DeviceTokenRepositoryPort`'s doc comment. */
@Injectable()
export class TypeOrmDeviceTokenRepository implements DeviceTokenRepositoryPort {
  constructor(
    @InjectRepository(DeviceTokenPersistenceModel)
    private readonly repository: Repository<DeviceTokenPersistenceModel>,
  ) {}

  async findByUserId(userId: string): Promise<DeviceToken[]> {
    const models = await this.repository.find({ where: { userId } });
    return models.map(toDomain);
  }

  async findByFcmToken(fcmToken: string): Promise<DeviceToken | null> {
    const model = await this.repository.findOne({ where: { fcmToken } });
    return model ? toDomain(model) : null;
  }

  async save(token: DeviceToken): Promise<DeviceToken> {
    const saved = await this.repository.save(toPersistence(token));
    return toDomain(saved);
  }
}
