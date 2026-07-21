// TASK-050 (MOD-01, NFR-004): a separate Jest config for the performance harness so `npm test`
// never runs it (perf files use a `.perf-spec.ts` suffix that the base `testRegex` deliberately
// doesn't match), while still reusing the exact ts-jest transform + module mapping the whole e2e
// suite already relies on. Run it with `npm run perf`. See perf/README.md.
const base = require('./package.json').jest;

module.exports = {
  ...base,
  roots: ['<rootDir>/perf'],
  testRegex: '\\.perf-spec\\.ts$',
  // The harness boots the real app, runs migrations against a throwaway Postgres, and drives 100
  // concurrent requests — well beyond the default 20s per-test budget.
  testTimeout: 180000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.perf.json' }],
  },
};
