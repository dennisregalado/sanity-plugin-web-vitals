import {defineConfig} from '@sanity/pkg-utils'

export default defineConfig({
  dist: 'dist',
  tsconfig: 'tsconfig.dist.json',
  exports: {
    '.': {
      source: './src/index.ts',
      import: './dist/index.js',
      default: './dist/index.js',
    },
    './server': {
      source: './src/server/index.ts',
      import: './dist/server.js',
      default: './dist/server.js',
    },
  },

  // Remove this block to enable strict export validation
  extract: {
    checkTypes: false,
    rules: {
      'ae-incompatible-release-tags': 'off',
      'ae-internal-missing-underscore': 'off',
      'ae-missing-release-tag': 'off',
    },
  },
})
