import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../domain/refresh-token.entity';
import { RefreshTokenRepositoryPort } from '../application/ports/refresh-token-repository.port';
import { toDomain, toPersistence } from './persistence/refresh-token.mapper';
import { RefreshTokenPersistenceModel } from './persistence/refresh-token.persistence-model';

@Injectable()
export class TypeOrmRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(
    @InjectRepository(RefreshTokenPersistenceModel)
    private readonly repository: Repository<RefreshTokenPersistenceModel>,
  ) {}

  async save(token: RefreshToken): Promise<void> {
    await this.repository.save(toPersistence(token));
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const model = await this.repository.findOne({ where: { tokenHash } });
    return model ? toDomain(model) : null;
  }

  async revokeById(id: string, revokedAt: Date): Promise<void> {
    await this.repository.update({ id }, { revokedAt });
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    // Only currently-unrevoked rows — this also catches the token that's still "active" in the
    // family, which is exactly what forces re-login on replay (AC-019).
    await this.repository.update({ familyId, revokedAt: IsNull() }, { revokedAt });
  }
}
