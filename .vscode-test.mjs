import { defineConfig } from '@vscode/test-cli'

/**
 * VS Code Test CLI Configuration
 * Reference: https://code.visualstudio.com/api/working-with-extensions/testing-extension
 */
export default defineConfig([
  {
    label: 'e2eTests',
    workspaceFolder: './test/workspace',
    files: 'test/**/*.test.ts',
    mocha: {
      require: ['ts-node/register'],
    }
  },
]);
