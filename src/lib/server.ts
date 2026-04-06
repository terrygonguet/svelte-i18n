import { command, getRequestEvent, query } from "$app/server"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import {
	error,
	type Handle,
	type RemoteCommand,
	type RemoteQueryFunction,
	type RequestEvent,
} from "@sveltejs/kit"
import { safe } from "@terrygonguet/utils/result"

type MaybePromise<T> = T | Promise<T>

export type TranslationCategory = { [key: string]: string }
export type TranslationLanguage = { [category: string]: TranslationCategory }
export type Translations = { [lang: string]: TranslationLanguage }

export interface CreateSvelteI18NServerBundleOptions {
	getLang?(event: RequestEvent): MaybePromise<string>
	fetchData(options: {
		where: { langs: "all" | string[]; categories: "all" | string[] }
		event: RequestEvent
	}): MaybePromise<Translations | undefined>
	updateData?(
		data: { category: string; key: string; langs: { [lang: string]: string } },
		event: RequestEvent,
	): MaybePromise<void>
}

export interface SvelteI18NServerBundle {
	fetchCategory: RemoteQueryFunction<{ lang: string; category: string }, TranslationCategory>
	fetchAll: RemoteQueryFunction<
		{ langs: "all" | string[]; categories: "all" | string[] },
		Translations
	>
	updateKey: RemoteCommand<
		{ category: string; key: string; langs: { [lang: string]: string } },
		Promise<Translations>
	>
	handle: Handle
}

export function createSvelteI18NServerBundle({
	getLang,
	fetchData,
	updateData,
}: CreateSvelteI18NServerBundleOptions): SvelteI18NServerBundle {
	const fetchCategory = query.batch(fetchCategoryValidator, async (inputs) => {
		const event = getRequestEvent()
		const langs: string[] = []
		const categories: string[] = []
		for (const input of inputs) {
			if (langs.indexOf(input.lang) == -1) langs.push(input.lang)
			if (categories.indexOf(input.category) == -1) categories.push(input.category)
		}

		const [err, data] = await safe(async () =>
			fetchData({ where: { categories, langs }, event }),
		).asTuple()

		if (err) error(500, "svelte-i18n.error_get_fail")
		else if (!data) error(404, "svelte-i18n.error_not_found")

		return ({ lang, category }) => {
			const translations = data[lang]?.[category] ?? null
			if (!translations) error(404, "svelte-i18n.error_not_found")

			return translations
		}
	})

	const fetchAll = query(fetchAllValidator, async ({ langs, categories }) => {
		const event = getRequestEvent()
		const [err, data] = await safe(async () =>
			fetchData({ where: { categories, langs }, event }),
		).asTuple()

		if (err) error(500, "svelte-i18n.error_get_fail")
		else if (!data) error(404, "svelte-i18n.error_not_found")
		else return data
	})

	const updateKey = command(updateValidator, async ({ category, key, langs }) => {
		if (!updateData) error(503, "svelte-i18n.error_save_unavailable")

		const [err] = await safe(async () =>
			updateData({ category, key, langs }, getRequestEvent()),
		).asTuple()

		if (err) error(503, "svelte-i18n.error_save_fail")
		else return fetchAll({ langs: Object.keys(langs), categories: [category] })
	})

	return {
		fetchCategory,
		fetchAll,
		updateKey,
		async handle({ event, resolve }) {
			if (!getLang) return resolve(event)
			const lang = await getLang(event)
			return resolve(event, {
				transformPageChunk({ html }) {
					return html.replaceAll("%svelte-i18n.lang%", lang)
				},
			})
		},
	}
}

const fetchCategoryValidator: StandardSchemaV1<{
	lang: string
	category: string
}> = {
	"~standard": {
		version: 1,
		vendor: "@terrygonguet/svelte-i18n",
		validate(value) {
			if (typeof value != "object" || value == null || Array.isArray(value))
				return { issues: [{ message: "svelte-i18n.error_bad_input" }] }

			const issues: StandardSchemaV1.Issue[] = []
			const { category, lang } = value as Record<string, unknown>
			if (typeof lang != "string" || !lang)
				issues.push({ message: "svelte-i18n.error_missing_lang", path: ["lang"] })
			if (typeof category != "string" || !category)
				issues.push({ message: "svelte-i18n.error_missing_category", path: ["category"] })

			if (issues.length) return { issues }
			else return { value: { category: category as string, lang: lang as string } }
		},
	},
}

const fetchAllValidator: StandardSchemaV1<{
	langs: "all" | string[]
	categories: "all" | string[]
}> = {
	"~standard": {
		version: 1,
		vendor: "@terrygonguet/svelte-i18n",
		validate(value) {
			if (typeof value != "object" || value == null || Array.isArray(value))
				return { issues: [{ message: "svelte-i18n.error_bad_input" }] }

			const issues: StandardSchemaV1.Issue[] = []
			const { categories, langs } = value as Record<string, unknown>

			if (typeof langs == "string") {
				if (langs != "all")
					issues.push({ message: "svelte-i18n.error_langs_invalid", path: ["langs"] })
			} else {
				if (typeof langs != "object" || !Array.isArray(langs))
					issues.push({ message: "svelte-i18n.error_langs_not_array", path: ["langs"] })
				else {
					for (const [i, lang] of langs.entries()) {
						if (typeof lang != "string" || !lang)
							issues.push({ message: "svelte-i18n.error_bad_lang", path: ["langs", i] })
					}
				}
			}

			if (typeof categories == "string") {
				if (categories != "all")
					issues.push({ message: "svelte-i18n.error_categories_invalid", path: ["categories"] })
			} else {
				if (typeof langs != "object" || !Array.isArray(categories))
					issues.push({ message: "svelte-i18n.error_categories_not_array", path: ["categories"] })
				else {
					for (const [i, lang] of categories.entries()) {
						if (typeof lang != "string" || !lang)
							issues.push({ message: "svelte-i18n.error_bad_category", path: ["categories", i] })
					}
				}
			}

			if (issues.length) return { issues }
			else return { value: { categories: categories as string[], langs: langs as string[] } }
		},
	},
}

const updateValidator: StandardSchemaV1<{
	category: string
	key: string
	langs: { [lang: string]: string }
}> = {
	"~standard": {
		version: 1,
		vendor: "@terrygonguet/svelte-i18n",
		validate(value) {
			if (typeof value != "object" || value == null || Array.isArray(value))
				return { issues: [{ message: "svelte-i18n.error_bad_input" }] }

			const issues: StandardSchemaV1.Issue[] = []
			const { category, key, langs } = value as Record<string, unknown>
			if (typeof category != "string" || !category)
				issues.push({ message: "svelte-i18n.error_missing_category", path: ["category"] })
			if (typeof key != "string" || !key)
				issues.push({ message: "svelte-i18n.error_missing_key", path: ["key"] })
			if (typeof langs != "object" || !langs)
				issues.push({ message: "svelte-i18n.error_missing_langs", path: ["langs"] })
			else {
				for (const lang of Object.values(langs)) {
					if (typeof lang != "string" || !lang)
						issues.push({ message: "svelte-i18n.error_bad_lang", path: ["langs", lang] })
				}
			}

			if (issues.length) return { issues }
			else
				return {
					value: {
						category: category as string,
						key: key as string,
						langs: { ...(langs as Record<string, string>) },
					},
				}
		},
	},
}
