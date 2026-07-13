import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AcknowledgeAlertUseCase } from '../application/acknowledge-alert.usecase';
import { ListAlertsUseCase } from '../application/list-alerts.usecase';
import { Alert } from '../domain/alert.entity';

/** Wire shape of the `Alert` schema (contracts/openapi.yaml). */
interface AlertResponse {
  id: string;
  projectId: string;
  type: string;
  severity: string;
  state: string;
  message: string;
  raisedAt: string;
  acknowledgedAt: string | null;
  /** TASK-017/R7: set once this CRITICAL alert was re-notified past the SLA (AC-054). */
  escalatedAt: string | null;
}

function toResponse(alert: Alert): AlertResponse {
  return {
    id: alert.id,
    projectId: alert.projectId,
    type: alert.type,
    severity: alert.severity,
    state: alert.state,
    message: alert.message,
    raisedAt: alert.raisedAt.toISOString(),
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    escalatedAt: alert.escalatedAt?.toISOString() ?? null,
  };
}

/**
 * `AlertsController` (TASK-015, CON-038/039, AC-056/059). `ProjectScopeGuard` already validated
 * membership for both routes; list is open to any role (Partner views read-only, R2); acknowledge
 * authorization is role- and alert-type-dependent (`Alert.canBeAcknowledgedBy`), so it's enforced
 * inside the use-case rather than a static `@Roles()` allow-list.
 */
@Controller('projects/:projectId/alerts')
export class AlertsController {
  constructor(
    private readonly listAlerts: ListAlertsUseCase,
    private readonly acknowledgeAlert: AcknowledgeAlertUseCase,
  ) {}

  @Get()
  async listHandler(): Promise<AlertResponse[]> {
    const alerts = await this.listAlerts.execute();
    return alerts.map(toResponse);
  }

  @Post(':alertId/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeHandler(@Param('alertId') alertId: string): Promise<AlertResponse> {
    const alert = await this.acknowledgeAlert.execute(alertId);
    return toResponse(alert);
  }
}
