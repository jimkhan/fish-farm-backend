import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetToken } from '../domain/password-reset-token.entity';
import { PasswordResetTokenRepositoryPort } from '../application/ports/password-reset-token-repository.port';
import { toDomain, toPersistence } from './persistence/password-reset-token.mapper';
import { PasswordResetTokenPersistenceModel } from './persistence/password-reset-token.persistence-model';

@Injectable()
export class TypeOrmPasswordResetTokenRepository implements PasswordResetTokenRepositoryPort {
  constructor(
    @InjectRepository(PasswordResetTokenPersistenceModel)
    private readonly repository: Repository<PasswordResetTokenPersistenceModel>,
  ) {}

  async save(token: PasswordResetToken): Promise<void> {
    await this.repository.save(toPersistence(token));
  }

  async findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const model = await this.repository.findOne({ where: { tokenHash } });
    return model ? toDomain(model) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.repository.update({ id }, { usedAt });
  }
}
