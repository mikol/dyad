module.exports = {
  predist: 'tslint --project .',
  dist: 'tsc',
  prepublish: 'run test',
  publish: 'npm publish',
  test: 'mocha --require ts-node/register --watch-extensions ts,tsx **/*.test.ts',
  watchtest: 'run test -- --watch'
}
