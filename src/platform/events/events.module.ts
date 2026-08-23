import { Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

/**
 * Platform event bus (TASK-006, FT-007, ADR-015). Feature modules import this module, inject
 * `DomainEventBus`, publish their past-tense events, and subscribe (typically in
 * `onModuleInit`) to the events they react to.
 *
 * The bus optionally injects `TransactionContext` (from the global `TransactionModule`) to take
 * a savepoint around each handler attempt — see `DomainEventBus.runIsolated`. It is optional by
 * design: a minimal app that boots this module without a database simply gets un-savepointed
 * dispatch, which is correct, since there is no transaction to protect.
 */
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
