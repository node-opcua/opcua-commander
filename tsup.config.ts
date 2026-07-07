import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['lib/index.ts'],
  format: ['cjs'],
  outDir: 'bin',
  bundle: true,
  noExternal: [/.*/],
  minify: false,
  shims: true,
  splitting: false,
  treeshaking: false,
  esbuildOptions: (options) => {
    options.external = ['term.js', 'pty.js'];
  },
});
