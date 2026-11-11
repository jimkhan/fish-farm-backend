import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TransactionContext } from '../../../platform/persistence/transaction-context';
import { Project } from '../domain/project.entity';
import {
  ProjectListPage,
  ProjectRepositoryPort,
} from '../application/ports/project-repository.port';
import { decodeCursor, encodeCursor } from './cursor.util';
import { toDomain, toPersistence } from './persistence/project.mapper';
import { ProjectPersistenceModel } from './persistence/project.persistence-model';

@Injectable()
export class TypeOrmProjectRepository implements ProjectRepositoryPort {
  constructor(
    @InjectRepository(ProjectPersistenceModel)
    private readonly repository: Repository<ProjectPersistenceModel>,
    private readonly transactions: TransactionContext,
  ) {}

  /** The repository to use right now: the request transaction's, or the base one (TASK-005). */
  private get repo(): Repository<ProjectPersistenceModel> {
    const manager = this.transactions.manager;
    return manager ? manager.getRepository(ProjectPersistenceModel) : this.repository;
  }

  async findById(id: string): Promise<Project | null> {
    const model = await this.repo.findOne({ where: { id } });
    return model ? toDomain(model) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Project[]> {
    if (ids.length === 0) {
      return [];
    }
    const models = await this.repo.find({ where: { id: In([...ids]) } });
    return models.map(toDomain);
  }

  async findAllActive(): Promise<Project[]> {
    const models = await this.repo.find({ where: { status: 'ACTIVE' } });
    return models.map(toDomain);
  }

  async findPage(projectIds: string[], cursor: string | null, limit: number): Promise<ProjectListPage> {
    if (projectIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const qb = this.repo
      .createQueryBuilder('project')
      .where('project.id IN (:...projectIds)', { projectIds })
      .orderBy('project.created_at', 'ASC')
      .addOrderBy('project.id', 'ASC')
      .take(limit + 1);

    if (cursor) {
      const decoded = decodeCursor(cursor);
      qb.andWhere('(project.created_at, project.id) > (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: decoded.createdAt,
        cursorId: decoded.id,
      });
    }

    const models = await qb.getMany();
    const hasMore = models.length > limit;
    const page = hasMore ? models.slice(0, limit) : models;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { data: page.map(toDomain), nextCursor };
  }

  async save(project: Project): Promise<Project> {
    const saved = await this.repo.save(toPersistence(project));
    return toDomain(saved);
  }
}
