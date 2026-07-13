import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Task } from '../domain/task.entity';
import { TaskEventRepositoryPort } from '../application/ports/task-event-repository.port';
import { toDomain, toPersistence } from './persistence/task.mapper';
import { TaskPersistenceModel } from './persistence/task.persistence-model';

/** Unscoped — see `TaskEventRepositoryPort`'s doc comment for why (no `TenantContext` on a timer). */
@Injectable()
export class TypeOrmTaskEventRepository implements TaskEventRepositoryPort {
  constructor(
    @InjectRepository(TaskPersistenceModel)
    private readonly repository: Repository<TaskPersistenceModel>,
  ) {}

  async findDueOrOverdue(asOf: Date): Promise<Task[]> {
    const models = await this.repository.find({
      where: {
        status: In(['SCHEDULED', 'DUE']),
        dueOn: LessThanOrEqual(asOf),
      },
    });
    return models.map(toDomain);
  }

  async save(task: Task): Promise<Task> {
    const saved = await this.repository.save(toPersistence(task));
    return toDomain(saved);
  }
}
