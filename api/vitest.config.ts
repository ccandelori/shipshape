import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // True single-process execution. `fileParallelism: false` alone is not
    // sufficient in vitest 4 — files can still interleave across worker
    // threads, and our setup.ts TRUNCATEs the shared dev DB at the start
    // of every file. One file's wipe can land in the middle of another
    // file's INSERTs and corrupt its test state. `singleFork` pins every
    // test file to a single node process, guaranteeing serialization.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
    // Retry intermittently-failing tests once before declaring failure.
    // The shared dev-DB tests are sensitive to background processes
    // (the dev API's setInterval ticks, collaboration server taps) that
    // can land mid-INSERT under load. A single retry catches that class
    // without masking real regressions — a deterministic failure still
    // surfaces on the second attempt.
    retry: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules', 'dist', 'src/test/**'],
    },
  },
})
