import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';

/** MOD-11's thin backend surface (TASK-007, CON-041) over `@fish-farm/calendar`. */
@Module({
  controllers: [CalendarController],
})
export class CalendarModule {}
