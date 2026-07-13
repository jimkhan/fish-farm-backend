import { Module } from '@nestjs/common';
import { DomainEventBus } from './domain-event-bus';

/**
 * Platform event bus (TASK-006, FT-007, ADR-015). Feature modules import this module, inject
 * `DomainEventBus`, publish their past-tense events, and subscribe (typically in
 * `onModuleInit`) to the events they react to.
 */
@Module({
  providers: [DomainEventBus],
  exports: [DomainEventBus],
})
export class EventsModule {}
