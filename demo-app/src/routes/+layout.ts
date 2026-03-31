import { SvelteI18N } from "@terrygonguet/svelte-i18n"

export async function load({ fetch, data }) {
	const i18n = new SvelteI18N({ ...data, fetch })
	return { i18n, t: i18n.t.bind(i18n), c: i18n.c.bind(i18n) }
}
