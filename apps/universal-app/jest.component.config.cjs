module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  testMatch: ['<rootDir>/src/component-tests/**/*.component.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/component-tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
