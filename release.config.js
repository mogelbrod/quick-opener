const common = {
  preset: 'conventionalcommits',
  presetConfig: {
    types: [
      { type: 'revert', section: 'Reverts' },
      { type: 'feat', section: 'Features' },
      { type: 'fix', section: 'Bug Fixes' },
      { type: 'perf', section: 'Performance Improvements' },
      { type: 'refactor', section: 'Code Refactoring' },
      { type: 'build', section: 'Build System', hidden: true },
      { type: 'chore', section: 'Chores', hidden: true },
      { type: 'ci', section: 'Continuous Integration', hidden: true },
      { type: 'docs', section: 'Documentation', hidden: true },
      { type: 'style', section: 'Styles', hidden: true },
      { type: 'test', section: 'Tests', hidden: true },
    ]
  },
  releaseRules: [
    { breaking: true, release: 'major' },
    { revert: true, release: 'patch' },
    { type: 'feat', release: 'minor' },
    { type: 'fix', release: 'patch' },
    { type: 'refactor', release: 'patch' },
    { type: 'perf', release: 'patch' },
    { type: 'build', release: false },
    { scope: 'no-release', release: false },
    { scope: 'deps-dev', release: false },
    { scope: 'dev-deps', release: false },
  ],
  parserOpts: {
    noteKeywords: ['BREAKING CHANGES', 'BREAKING CHANGE'],
  },
}

module.exports = {
  branches: [
    '+([0-9])?(.{+([0-9]),x}).x',
    'main',
    'next',
    { name: 'beta', prerelease: true },
    { name: 'alpha', prerelease: true },
  ],
  plugins: [
    ['@semantic-release/commit-analyzer', common],
    ['@semantic-release/release-notes-generator', common],
    '@semantic-release/changelog',
    ['semantic-release-vsce', { packageVsix: true }],
    '@semantic-release/git',
    ['@semantic-release/github', {
      assets: [{ path: 'quickopener-{nextRelease.name}.vsix', label: 'Packaged extension (quickopener-{nextRelease.name}.vsix)' }],
    }],
  ]
}
