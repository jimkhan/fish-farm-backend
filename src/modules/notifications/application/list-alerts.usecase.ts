import { Inject, Injectable } from '@nestjs/common';
import { Alert } from '../domain/alert.entity';
import { ALERT_REPOSITORY, AlertRepositoryPort } from './ports/alert-repository.port';

/** `GET /projects/{projectId}/alerts` (CON-038, AC-056). Member-only (any role) — Partner may view. */
@Injectable()
export class ListAlertsUseCase {
  constructor(@Inject(ALERT_REPOSITORY) private readonly alerts: AlertRepositoryPort) {}

  async execute(): Promise<Alert[]> {
    return this.alerts.findAllInCurrentProject();
  }
}
