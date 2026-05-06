// React-side Jest config (replaces react-scripts test from CRA).
// The Node-side tests under __tests__/ have their own config at
// jest.server.config.js; the two are independent and unaffected by each other.
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/__mocks__/fileMock.js',
  },
  // ESM-only deps blow up under default Jest CJS transform unless allowlisted.
  transformIgnorePatterns: [
    '/node_modules/(?!(axios|@tanstack)/)',
  ],
};
