import { readdirSync, readFileSync, statSync } from 'fs';
import { join, sep } from 'path';

/**
 * Frameworks/IO the domain layer must never import (ADR-001, NFR-006, invariant #2).
 * Matched against the text of `import`/`require` lines only.
 */
export const FORBIDDEN_IMPORTS = [
  '@nestjs/',
  'typeorm',
  'express',
  '@nestjs/axios',
  'axios',
  'node-fetch',
  'node:http',
  'node:https',
];

export interface PurityViolation {
  file: string;
  line: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** All non-test `.ts` files that live under any folder segment named `domain`. */
export function domainFiles(srcRoot: string): string[] {
  return walk(srcRoot).filter((f) => f.split(sep).includes('domain'));
}

/** Returns true if a single source line is a forbidden import/require. */
export function lineViolates(line: string): boolean {
  const isImport = /^\s*import\b/.test(line) || /\brequire\s*\(/.test(line);
  if (!isImport) return false;
  return FORBIDDEN_IMPORTS.some((forbidden) => line.includes(forbidden));
}

/** Scans every `domain/` file under `srcRoot` and returns each forbidden import found. */
export function findPurityViolations(srcRoot: string): PurityViolation[] {
  const violations: PurityViolation[] = [];
  for (const file of domainFiles(srcRoot)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (lineViolates(line)) {
        violations.push({ file, line: line.trim() });
      }
    }
  }
  return violations;
}
