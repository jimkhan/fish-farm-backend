import { Alert } from '../../../notifications/domain/alert.entity';

/** Wire shape of the `Alert` schema (contracts/openapi.yaml) — this endpoint's own response. */
export interface WaterEventAlertResponse {
  id: string;
  projectId: string;
  type: string;
  severity: string;
  state: string;
  message: string;
  raisedAt: string;
  acknowledgedAt: string | null;
  escalatedAt: string | null;
}

export function toWaterEventAlertResponse(alert: Alert): WaterEventAlertResponse {
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
