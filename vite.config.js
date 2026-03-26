import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    build: {
        lib: {
            entry: './src/index.js',
            name: 'POSTPROCESSINGFORK',
            formats: ['es', 'cjs', 'umd'],
            fileName: (format) => {
                if (format === 'es') return 'index.js';
                if (format === 'cjs') return 'index.cjs';
                if (format === 'umd') return 'postprocessing-fork.js';
            }
        },
        outDir: 'build-vite',
        sourcemap: true,
        rollupOptions: {
            external: ['spatial-controls', 'run-scene-core', 'tweakpane'],
            output: {
                globals: {
                    'run-scene-core': 'THREE',
                    'spatial-controls': 'SpatialControls',
                    'tweakpane': 'Tweakpane'
                }
            }
        }
    },
    resolve: {
        alias: {
            'three': 'run-scene-core',
            'postprocessing': path.resolve(__dirname, './src/index.js'),
            'src': path.resolve(__dirname, './src')
        }
    },
    plugins: [
        {
            name: 'glsl-loader',
            transform(code, id) {
                if (id.endsWith('.glsl') || id.endsWith('.frag') || id.endsWith('.vert')) {
                    return {
                        code: `export default ${JSON.stringify(code)};`,
                        map: null
                    };
                }
            }
        },
        visualizer({
            open: true,
            filename: 'build-vite/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap'
        })
    ]
});
