import type { SvelteI18N } from "@terrygonguet/svelte-i18n"

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			i18n: SvelteI18N
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}
