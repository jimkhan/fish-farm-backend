import { Injectable } from '@nestjs/common';
import { ScopedRepository } from '../../../shared-kernel/tenant/scoped-repository';
import { Camera } from '../domain/camera.entity';
import { CameraRepositoryPort } from '../application/ports/camera-repository.port';
import { CameraPersistenceModel } from './persistence/camera.persistence-model';
import { toDomain } from './persistence/camera.mapper';

@Injectable()
export class TypeOrmCameraRepository implements CameraRepositoryPort {
  constructor(private readonly scoped: ScopedRepository<CameraPersistenceModel>) {}

  async findForCurrentProject(): Promise<Camera | null> {
    const [model] = await this.scoped.find();
    return model ? toDomain(model) : null;
  }
}
