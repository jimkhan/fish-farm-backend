import { Alert } from './alert.entity';
import { InvalidTransitionError } from './notifications-errors';

const baseProps = {
  id: 'a-1',
  projectId: 'p-1',
  type: 'WATER_THRESHOLD' as const,
  severity: 'WARNING' as const,
  state: 'RAISED' as const,
  message: 'DO below sane range',
  sourceRef: 'pond-1',
  raisedAt: new Date('2026-01-01T00:00:00Z'),
  acknowledgedAt: null,
  resolvedAt: null,
  escalatedAt: null,
};

describe('Alert (TASK-015, MOD-09 §4.3/F1, R4/R5)', () => {
  describe('dedupKey (R5)', () => {
    it('is deterministic from projectId+type+sourceRef, independent of event id', () => {
      expect(Alert.dedupKey('p-1', 'WATER_THRESHOLD', 'pond-1')).toBe(
        'p-1:WATER_THRESHOLD:pond-1',
      );
      const alert = Alert.reconstitute(baseProps);
      expect(alert.dedupKey).toBe('p-1:WATER_THRESHOLD:pond-1');
    });
  });

  describe('AC-051: state transitions', () => {
    it('RAISED → SENT is valid', () => {
      const alert = Alert.reconstitute(baseProps);
      expect(alert.transitionTo('SENT').state).toBe('SENT');
    });

    it('RAISED → ACKNOWLEDGED is valid (delivery/SENT is TASK-016, not required to acknowledge)', () => {
      const alert = Alert.reconstitute(baseProps);
      const acked = alert.transitionTo('ACKNOWLEDGED');
      expect(acked.state).toBe('ACKNOWLEDGED');
      expect(acked.acknowledgedAt).not.toBeNull();
    });

    it('ACKNOWLEDGED → RESOLVED is valid', () => {
      const alert = Alert.reconstitute({ ...baseProps, state: 'ACKNOWLEDGED' });
      const resolved = alert.transitionTo('RESOLVED');
      expect(resolved.state).toBe('RESOLVED');
      expect(resolved.resolvedAt).not.toBeNull();
    });

    it('rejects skipping backwards (RESOLVED → RAISED)', () => {
      const alert = Alert.reconstitute({ ...baseProps, state: 'RESOLVED' });
      expect(() => alert.transitionTo('RAISED')).toThrow(InvalidTransitionError);
    });

    it('rejects SENT → RAISED', () => {
      const alert = Alert.reconstitute({ ...baseProps, state: 'SENT' });
      expect(() => alert.transitionTo('RAISED')).toThrow(InvalidTransitionError);
    });

    it('a same-state transition is a no-op, not an error', () => {
      const alert = Alert.reconstitute(baseProps);
      expect(alert.transitionTo('RAISED')).toBe(alert);
    });

    it('does not mutate the original instance', () => {
      const alert = Alert.reconstitute(baseProps);
      alert.transitionTo('SENT');
      expect(alert.state).toBe('RAISED');
    });
  });

  describe('edge case 4: acknowledge() is idempotent', () => {
    it('acknowledges a RAISED alert', () => {
      const alert = Alert.reconstitute(baseProps);
      expect(alert.acknowledge().state).toBe('ACKNOWLEDGED');
    });

    it('acknowledging an already-ACKNOWLEDGED alert is a no-op returning the same instance', () => {
      const alert = Alert.reconstitute({ ...baseProps, state: 'ACKNOWLEDGED' });
      expect(alert.acknowledge()).toBe(alert);
    });

    it('acknowledging a RESOLVED alert is a no-op, not an error', () => {
      const alert = Alert.reconstitute({ ...baseProps, state: 'RESOLVED' });
      expect(() => alert.acknowledge()).not.toThrow();
      expect(alert.acknowledge()).toBe(alert);
    });
  });

  describe('R4: upliftSeverity — "create/uplift" on a repeated, worsening breach', () => {
    it('uplifts WARNING → CRITICAL', () => {
      const alert = Alert.reconstitute(baseProps); // WARNING
      const uplifted = alert.upliftSeverity('CRITICAL');
      expect(uplifted.severity).toBe('CRITICAL');
      expect(uplifted).not.toBe(alert);
    });

    it('does not downgrade CRITICAL → WARNING', () => {
      const alert = Alert.reconstitute({ ...baseProps, severity: 'CRITICAL' });
      expect(alert.upliftSeverity('WARNING')).toBe(alert);
    });

    it('an equal severity is a no-op (same instance)', () => {
      const alert = Alert.reconstitute(baseProps); // WARNING
      expect(alert.upliftSeverity('WARNING')).toBe(alert);
    });
  });

  describe('AC-059/R8: canBeAcknowledgedBy', () => {
    it('Owner can always acknowledge, regardless of alert type', () => {
      const operational = Alert.reconstitute({ ...baseProps, type: 'WATER_THRESHOLD' });
      const nonOperational = Alert.reconstitute({ ...baseProps, type: 'WATER_EMERGENCY' });
      expect(operational.canBeAcknowledgedBy('OWNER')).toBe(true);
      expect(nonOperational.canBeAcknowledgedBy('OWNER')).toBe(true);
    });

    it('Worker can acknowledge operational types (MISSED_TASK/LOW_STOCK/WATER_THRESHOLD)', () => {
      for (const type of ['MISSED_TASK', 'LOW_STOCK', 'WATER_THRESHOLD'] as const) {
        const alert = Alert.reconstitute({ ...baseProps, type });
        expect(alert.canBeAcknowledgedBy('WORKER')).toBe(true);
      }
    });

    it('Worker cannot acknowledge non-operational types (WATER_EMERGENCY/ABNORMAL_MORTALITY)', () => {
      for (const type of ['WATER_EMERGENCY', 'ABNORMAL_MORTALITY'] as const) {
        const alert = Alert.reconstitute({ ...baseProps, type });
        expect(alert.canBeAcknowledgedBy('WORKER')).toBe(false);
      }
    });

    it('Partner can never acknowledge, regardless of type', () => {
      const alert = Alert.reconstitute(baseProps);
      expect(alert.canBeAcknowledgedBy('PARTNER')).toBe(false);
      expect(alert.canBeAcknowledgedBy('INVESTOR')).toBe(false);
    });
  });

  describe('isActive', () => {
    it('is true for any non-RESOLVED state', () => {
      for (const state of ['RAISED', 'SENT', 'ACKNOWLEDGED'] as const) {
        expect(Alert.reconstitute({ ...baseProps, state }).isActive).toBe(true);
      }
    });

    it('is false once RESOLVED', () => {
      expect(Alert.reconstitute({ ...baseProps, state: 'RESOLVED' }).isActive).toBe(false);
    });
  });

  describe('R7/AC-054: escalate', () => {
    it('sets escalatedAt the first time', () => {
      const alert = Alert.reconstitute(baseProps);
      const escalated = alert.escalate();
      expect(escalated.escalatedAt).not.toBeNull();
      expect(escalated).not.toBe(alert);
    });

    it('is idempotent — escalating an already-escalated alert is a no-op returning the same instance', () => {
      const alert = Alert.reconstitute({ ...baseProps, escalatedAt: new Date('2026-01-01T00:20:00Z') });
      expect(alert.escalate()).toBe(alert);
    });
  });
});
