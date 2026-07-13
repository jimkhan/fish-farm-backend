import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../domain/user.entity';
import { NewUserProps, UserRepositoryPort } from '../application/ports/user-repository.port';
import { toDomain } from './persistence/user.mapper';
import { UserPersistenceModel } from './persistence/user.persistence-model';

@Injectable()
export class TypeOrmUserRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserPersistenceModel)
    private readonly repository: Repository<UserPersistenceModel>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const model = await this.repository.findOne({ where: { email } });
    return model ? toDomain(model) : null;
  }

  async findById(id: string): Promise<User | null> {
    const model = await this.repository.findOne({ where: { id } });
    return model ? toDomain(model) : null;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.repository.update({ id: userId }, { passwordHash });
  }

  async create(props: NewUserProps): Promise<User> {
    const saved = await this.repository.save({
      email: props.email,
      name: props.name,
      passwordHash: props.passwordHash,
      status: 'ACTIVE',
    });
    return toDomain(saved);
  }
}
