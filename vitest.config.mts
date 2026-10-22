import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // The modules that can be unit tested outside of a VS Code host. The
      // extension host modules need a running VS Code, so they are not part of
      // the coverage report.
      include: [
        'src/SecurityManager.ts',
        'src/NavigationHistory.ts',
        'src/types.ts',
        'src/Frameability.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 70,
      },
    },
  },
});
