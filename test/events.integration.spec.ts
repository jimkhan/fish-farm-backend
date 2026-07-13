import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DomainEvent } from '@fish-farm/shared';
import { DomainEventBus } from '../src/platform/events/domain-event-bus';
import { EventsModule } from '../src/platform/events/events.module';

/**
 * DI integration for the event bus (TASK-006): a subscriber wired the way feature modules will
 * do it (inject the bus, subscribe in onModuleInit). Happy path: a published event reaches the
 * subscriber. Failure path: a throwing subscriber never rejects the publisher (AC-013).
 */

@Injectable()
class WidgetProjectionSubscriber implements OnModuleInit {
  readonly received: DomainEvent[] = [];

  constructor(private readonly bus: DomainEventBus) {}

  onModuleInit(): void {
    this.bus.subscribe('WidgetPlanted', async (e) => {
      this.received.push(e);
    });
    this.bus.subscribe('WidgetPlanted', async () => {
      throw new Error('projection store down'); // the failure path, alongside the healthy one
    });
  }
}

@Module({ imports: [EventsModule], providers: [WidgetProjectionSubscriber] })
class EventsTestModule {}

describe('Event bus DI integration (TASK-006)', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('a module-wired subscriber receives published events; a throwing one never breaks publish', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [EventsTestModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const bus = app.get(DomainEventBus);
    const subscriber = app.get(WidgetProjectionSubscriber);

    const event: DomainEvent = {
      name: 'WidgetPlanted',
      eventId: 'evt-int-1',
      occurredAt: new Date('2026-07-08T00:00:00Z'),
      projectId: 'p-1',
    };
    await expect(bus.publish(event)).resolves.toBeUndefined();

    expect(subscriber.received).toEqual([event]);
    await app.close();
  });
});
