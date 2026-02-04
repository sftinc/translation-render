// Auto-minify client scripts with esbuild
// Usage: tsx scripts/generate-client-scripts.ts

import { build } from 'esbuild'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, '../src')

const configs = [
	{
		source: 'deferred/deferred-script.ts',
		output: 'deferred/deferred-script-content.ts',
		exportName: 'DEFERRED_SCRIPT',
	},
	{
		source: 'recovery/recovery-script.ts',
		output: 'recovery/recovery-script-content.ts',
		exportName: 'RECOVERY_SCRIPT',
	},
]

for (const config of configs) {
	const sourcePath = join(SRC_DIR, config.source)
	const outputPath = join(SRC_DIR, config.output)

	const result = await build({
		entryPoints: [sourcePath],
		bundle: true,
		format: 'iife',
		minify: true,
		write: false,
		target: ['es2020'],
		platform: 'browser',
	})

	const minified = result.outputFiles[0].text.trimEnd()

	const content = [
		`// Auto-generated — do not edit. Source: ${config.source}`,
		`export const ${config.exportName} = ${JSON.stringify(minified)}`,
		'',
	].join('\n')

	writeFileSync(outputPath, content)
	console.log(`Generated ${config.output} (${minified.length} bytes)`)
}
