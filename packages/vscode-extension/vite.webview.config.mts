import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
	plugins: [solid()],
	build: {
		outDir: fileURLToPath(new URL('./dist/schema-reference', import.meta.url)),
		lib: {
			entry: fileURLToPath(new URL('./webview/schema-reference.tsx', import.meta.url)),
			name: 'AtomizeSchemaReference',
			formats: ['iife'],
			fileName: () => 'schema-reference.js',
			cssFileName: 'schema-reference',
		},
	},
});
