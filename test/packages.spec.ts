import { CALENDAR_PACKAGE_NAME } from '@fish-farm/calendar';
import { DomainEvent } from '@fish-farm/shared';
import calendarPkg from '../packages/calendar/package.json';
import sharedPkg from '../packages/shared/package.json';
import rootPkg from '../package.json';

/**
 * Shared-package hosting wiring (TASK-051, AC-143 — backend surface). Web/mobile prove their
 * halves (install + identical anchor tests) when those repos are scaffolded (TASK-013/042) and
 * the calendar lands (TASK-007).
 */
describe('@fish-farm/* package hosting (TASK-051, OI-1, ADR-002)', () => {
  it('both packages import cleanly into the backend', () => {
    expect(CALENDAR_PACKAGE_NAME).toBe('@fish-farm/calendar');
    const event: DomainEvent = {
      name: 'WidgetPlanted',
      eventId: 'evt-1',
      occurredAt: new Date('2026-07-08T00:00:00Z'),
    };
    expect(event.name).toBe('WidgetPlanted');
  });

  it('the two packages carry the same version, and the backend depends on exactly that version', () => {
    expect(sharedPkg.version).toBe(calendarPkg.version);
    const deps = rootPkg.dependencies as Record<string, string>;
    expect(deps['@fish-farm/shared']).toBe(sharedPkg.version);
    expect(deps['@fish-farm/calendar']).toBe(calendarPkg.version);
  });

  it('both packages publish built output with type declarations (consumable without ts source)', () => {
    for (const pkg of [sharedPkg, calendarPkg] as Array<Record<string, unknown>>) {
      expect(pkg.main).toBe('dist/index.js');
      expect(pkg.types).toBe('dist/index.d.ts');
      expect(pkg.files).toEqual(['dist']);
    }
  });
});
