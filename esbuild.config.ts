import esbuild from 'esbuild'
import pkg from './package.json' assert { type: 'json' }
const externalDependencies = Object.keys(pkg.dependencies || {})

esbuild
  .build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    outdir: 'dist',
    platform: 'node',
    sourcemap: true,
    minify: false,
    format: 'esm',
    tsconfig: './tsconfig.json',
    external: externalDependencies,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  })
  .then(() => {
    console.log('Build completed successfully!')
  })
  .catch((error) => {
    console.error('Build failed:', error)
    process.exit(1)
  })
