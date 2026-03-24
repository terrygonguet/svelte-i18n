import adapter from "@sveltejs/adapter-node"
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			"@terrygonguet/svelte-i18n/editor": "src/lib/editor.svelte.js",
			"@terrygonguet/svelte-i18n/server": "src/lib/server.js",
			"@terrygonguet/svelte-i18n": "src/lib/index.js",
			"$minilib/*": "src/minilib/*",
			"$assets/*": "assets/*",
			"$content/*": "src/content/*",
			"$$/styles.css": "src/styles.css",
		},
	},
}

export default config
