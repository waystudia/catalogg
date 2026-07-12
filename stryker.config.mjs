/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  mutate: [
    'src/shared/pwaSession.ts:37:0-87:0',
    'src/shared/deliveryLocation.ts:1:0-95:0'
  ],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts'
  },
  reporters: ['clear-text', 'progress'],
  thresholds: { high: 90, low: 75, break: 60 },
  coverageAnalysis: 'perTest'
};

export default config;
