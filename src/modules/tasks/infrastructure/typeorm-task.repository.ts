import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Task } from '../domain/task.entity';
import { TaskRepositoryPort } from '../application/ports/task-repository.port';
import { TaskPersistenceModel } from './persistence/task.persistence-model';
import { toDomain, toPersistence } from './persistence/task.mapper';

@Injectable()
export class TypeOrmTaskRepository implements TaskRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<TaskPersistenceModel>) {}

  async findAllInCurrentProject(): Promise<Task[]> {
    const models = await this.scoped.find();
    return models.map(toDomain);
  }

  async findById(taskId: string): Promise<Task | null> {
    const model = await this.scoped.findOneById(taskId);
    return model ? toDomain(model) : null;
  }

  async save(task: Task): Promise<Task> {
    const saved = await this.scoped.save(toPersistence(task));
    return toDomain(saved);
  }

  async deleteById(taskId: string): Promise<boolean> {
    return this.scoped.deleteById(taskId);
  }
}
