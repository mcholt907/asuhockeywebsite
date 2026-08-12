module.exports = {
  testEnvironment: 'node',
  testRegex: '[/\\\\]__tests__[/\\\\][^/\\\\]+\\.test\\.js$',
  testPathIgnorePatterns: ['[/\\\\]src[/\\\\]'],
  transform: {},
  setupFiles: ['./jest.server.setup.js'],
};
