import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    // Testes de integração fazem IO real (Postgres) — precisam de mais tempo
    // que unit tests (default 5s). 20s cobre setup + migrations + requests.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Testes de integração rodam SERIAL pra não disputar conexões no DB.
    // Vitest 4 moveu poolOptions.threads.singleThread pra top-level.
    pool: 'threads',
    maxConcurrency: 1,
  },
})
