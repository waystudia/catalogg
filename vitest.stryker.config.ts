import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mutation-unit',
    environment: 'node',
    include: ['tests/unit/**/*.test.ts']
  }
});
