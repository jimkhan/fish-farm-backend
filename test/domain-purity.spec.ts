import { join } from 'path';
import { findPurityViolations, lineViolates } from './support/domain-purity';

const SRC_ROOT = join(__dirname, '..', 'src');

describe('domain purity (AC-009, NFR-006)', () => {
  it('no file under any domain/ folder imports a framework or IO library', () => {
    const violations = findPurityViolations(SRC_ROOT);
    // Readable failure: list every offending file:line if any appear.
    expect(violations.map((v) => `${v.file} :: ${v.line}`)).toEqual([]);
  });

  // Guards the above from passing vacuously (there are no domain/ files yet): prove the
  // detector actually flags forbidden imports and ignores allowed ones.
  it('detects forbidden imports and ignores permitted code', () => {
    expect(lineViolates(`import { Module } from '@nestjs/common';`)).toBe(true);
    expect(lineViolates(`import { Repository } from 'typeorm';`)).toBe(true);
    expect(lineViolates(`const axios = require('axios');`)).toBe(true);

    expect(lineViolates(`import { Batch } from './batch';`)).toBe(false);
    expect(lineViolates(`// a comment mentioning typeorm is fine`)).toBe(false);
    expect(lineViolates(`const nestjsLikeName = 1;`)).toBe(false);
  });
});
