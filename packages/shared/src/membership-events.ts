import { DomainEvent } from './domain-event';

/**
 * MOD-02 membership events (TASK-010, ADR-015). Published on `DomainEventBus` after a
 * membership is created/soft-removed; no subscriber exists yet (MOD-09 notifications may react
 * later per MOD-02 §4.6 — "may notify via MOD-09 later").
 */
export interface MemberInvited extends DomainEvent {
  readonly name: 'MemberInvited';
  readonly membershipId: string;
  readonly userId: string;
  readonly role: 'OWNER' | 'WORKER' | 'PARTNER';
}

export interface MemberRemoved extends DomainEvent {
  readonly name: 'MemberRemoved';
  readonly membershipId: string;
  readonly userId: string;
  readonly role: 'OWNER' | 'WORKER' | 'PARTNER';
}
