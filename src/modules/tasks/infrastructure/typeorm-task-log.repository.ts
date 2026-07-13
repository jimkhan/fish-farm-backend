import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { TaskLog } from '../domain/task-log.entity';
import { TaskLogRepositoryPort } from '../application/ports/task-log-repository.port';
import { TaskLogPersistenceModel } from './persistence/task-log.persistence-model';
import { toDomain, toPersistence } from './persistence/task-log.mapper';

@Injectable()
export class TypeOrmTaskLogRepository implements TaskLogRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<TaskLogPersistenceModel>) {}

  async findByClientMutationId(clientMutationId: string): Promise<TaskLog | null> {
    const [model] = await this.scoped.find({ clientMutationId });
    return model ? toDomain(model) : null;
  }

  async save(taskLog: TaskLog): Promise<TaskLog> {
    const saved = await this.scoped.save(toPersistence(taskLog));
    return toDomain(saved);
  }
}
