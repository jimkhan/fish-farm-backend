import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Static purity check (TASK-007, AC-047): `packages/calendar` imports no framework and never
 * calls `Intl`/ICU for Bangla dates (they implement the wrong — sidereal — calendar; R6).
 */
function sourceFiles(): string[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map((f) => join(__dirname, f));
}

const FORBIDDEN_IMPORTS = ['@nestjs/', 'typeorm', 'express', 'axios', 'node-fetch'];

describe('packages/calendar purity (AC-047, R6, R8)', () => {
  const files = sourceFiles();

  it('finds the expected calendar source files', () => {
    expect(files.map((f) => f.split('/').pop())).toEqual(
      expect.arrayContaining(['conversion.ts', 'format.ts', 'numerals.ts', 'ritu.ts', 'types.ts']),
    );
  });

  it('imports no framework package', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const isImport = /^\s*import\b/.test(line) || /\brequire\s*\(/.test(line);
        if (isImport && FORBIDDEN_IMPORTS.some((f) => line.includes(f))) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never calls the Intl namespace (the sidereal-calendar trap, R6)', () => {
    // Matches actual usage (`Intl.DateTimeFormat`, `date.toLocaleDateString(...)`), not the word
    // "Intl" inside doc comments explaining *why* it's forbidden.
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/\bIntl\s*\./.test(source) || /\btoLocale\w*\s*\(/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is deterministic: never calls Date.now(), Math.random(), or bare `new Date()` (R8)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (/Date\.now\s*\(/.test(source) || /Math\.random\s*\(/.test(source) || /new Date\(\s*\)/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
