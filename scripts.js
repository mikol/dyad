module.exports = {
  predist: 'tslint --project . && run test',
  dist: 'tsc',
  prepublish: 'run predist',
  publish: 'npm publish',
  test: 'mocha --require ts-node/register --watch-extensions ts,tsx **/*.test.ts',
  watchtest: 'run test -- --watch'
}
