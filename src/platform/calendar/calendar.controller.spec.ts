import { ValidationError } from '../../shared-kernel/errors/domain-error';
import { CalendarController } from './calendar.controller';

describe('CalendarController (TASK-007, CON-041)', () => {
  const controller = new CalendarController();

  it('converts a Gregorian date to the BanglaDate wire shape', () => {
    const result = controller.convert('2026-02-21'); // anchor: 21 Feb → 8 Falgun
    expect(result).toEqual({
      gregorian: '2026-02-21',
      banglaYear: 1432, // 2025 (governing Boishakh-1 year, before 14 Apr) - 593
      banglaMonth: 'FALGUN',
      banglaDay: 8,
      ritu: 'BOSONTO',
      formattedBn: '৮ Falgun, ১৪৩২',
    });
  });

  it('rejects a malformed date string', () => {
    expect(() => controller.convert('21-02-2026')).toThrow(ValidationError);
    expect(() => controller.convert('not-a-date')).toThrow(ValidationError);
  });

  it('rejects a missing date', () => {
    // @ts-expect-error — deliberately omitted to prove the runtime guard
    expect(() => controller.convert(undefined)).toThrow(ValidationError);
  });

  it('rejects a syntactically valid but impossible calendar date', () => {
    expect(() => controller.convert('2026-02-30')).toThrow(ValidationError);
  });
});
