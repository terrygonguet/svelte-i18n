import { json, type Handle, type RequestEvent } from "@sveltejs/kit"
import { safe } from "@terrygonguet/utils/result"

type MaybePromise<T> = T | Promise<T>

export type TranslationCategory = { [key: string]: string }
export type TranslationLanguage = { [category: string]: TranslationCategory }
export type Translations = { [lang: string]: TranslationLanguage }

export interface CreateSvelteI18NHandlerOptions {
	supportedLangs: string[]
	fallbackLang: string

	fetchCategory(options: {
		where: { lang: string; category: string }
		event: RequestEvent
	}): MaybePromise<TranslationCategory | undefined>
	canFetchCategory?(options: {
		where: { lang: string; category: string }
		event: RequestEvent
	}): MaybePromise<boolean>

	fetchAll(options: {
		where: { langs?: string[]; categories?: string[] }
		event: RequestEvent
	}): MaybePromise<Translations | undefined>
	canFetchAll?(options: {
		where: { langs?: string[]; categories?: string[] }
		event: RequestEvent
	}): MaybePromise<boolean>

	update(
		data: { category: string; key: string; langs: { [lang: string]: string } },
		options: { event: RequestEvent },
	): MaybePromise<void>
	canUpdate?(
		data: { category: string; key: string; langs: { [lang: string]: string } },
		options: { event: RequestEvent },
	): MaybePromise<boolean>
}

export interface SvelteI18NServerBundle {
	handle: Handle
	setSSRLang(
		event: Request,
		lang: string,
	): {
		lang: string
		fallbackLang: string
		supportedLangs: string[]
	}
}

export function createSvelteI18NServerBundle({
	supportedLangs,
	fallbackLang,
	fetchCategory,
	canFetchCategory,
	fetchAll,
	canFetchAll,
	update,
	canUpdate,
}: CreateSvelteI18NHandlerOptions): SvelteI18NServerBundle {
	const categoryRegEx = /^\/locale\/(?<lang>.+)\/(?<category>.+)\.json$/
	const allRegEx = /^\/locale\/all\.json$/

	//! HACK: stringified `where` is the key and the full response object is the value
	const cache = new Map<string, any>()
	const ssrLangs = new WeakMap<Request, string>()
	return {
		setSSRLang(request, lang) {
			ssrLangs.set(request, lang)
			return { lang, fallbackLang, supportedLangs }
		},
		async handle({ event, resolve }) {
			switch (event.request.method) {
				case "GET": {
					const match = categoryRegEx.exec(event.url.pathname)
					if (match) {
						const { lang = "", category = "" } = match.groups!
						if (canFetchCategory ? !canFetchCategory({ where: { lang, category }, event }) : false)
							return json({ message: "svelte-i18n.error_access_denied" }, { status: 403 })

						const cacheKey = JSON.stringify({ lang, category })
						const cached = cache.get(cacheKey)
						if (cached) return json(cached, { status: 200 })

						const [err, data] = await safe(async () =>
							fetchCategory({ where: { lang, category }, event }),
						).asTuple()
						if (err) return json({ message: "svelte-i18n.error_get_fail" }, { status: 500 })
						else if (!data) return json({ message: "svelte-i18n.error_not_found" }, { status: 404 })
						else {
							cache.set(cacheKey, data)
							return json(data, { status: 200 })
						}
					}

					if (allRegEx.test(event.url.pathname)) {
						const categoriesParam = event.url.searchParams.get("categories")
						const categories = categoriesParam?.split(",").map((cat) => cat.trim())
						const langsParams = event.url.searchParams.get("langs")
						const langs = langsParams?.split(",").map((lang) => lang.trim())
						if (canFetchAll ? !canFetchAll({ where: { langs, categories }, event }) : false)
							return json({ message: "svelte-i18n.error_access_denied" }, { status: 403 })

						const cacheKey = JSON.stringify({ langs, categories })
						const cached = cache.get(cacheKey)
						if (cached) return json(cached, { status: 200 })

						const [err, data] = await safe(async () =>
							fetchAll({ where: { categories, langs }, event }),
						).asTuple()
						if (err) return json({ message: "svelte-i18n.error_get_fail" }, { status: 500 })
						else if (!data) return json({ message: "svelte-i18n.error_not_found" }, { status: 404 })
						else {
							cache.set(cacheKey, data)
							return json(data, { status: 200 })
						}
					}

					break
				}

				case "POST": {
					if (allRegEx.test(event.url.pathname)) {
						const [parseErr, data] = await safe(() => event.request.json()).asTuple()
						if (parseErr) return json({ message: "svelte-i18n.error_bad_input" }, { status: 400 })

						if (typeof data != "object" || data == null || Array.isArray(data))
							return json({ message: "svelte-i18n.error_bad_input" }, { status: 400 })

						const { category, key, langs } = data
						if (typeof category != "string" || !category)
							return json({ message: "svelte-i18n.error_missing_category" }, { status: 400 })
						if (typeof key != "string" || !key)
							return json({ message: "svelte-i18n.error_missing_key" }, { status: 400 })
						if (typeof langs != "object" || !langs)
							return json({ message: "svelte-i18n.error_missing_langs" }, { status: 400 })

						for (const value of Object.values(langs)) {
							if (typeof value != "string")
								return json({ message: "svelte-i18n.error_bad_langs" }, { status: 400 })
						}

						if (canUpdate ? !canUpdate({ category, key, langs }, { event }) : false)
							return json({ message: "svelte-i18n.error_access_denied" }, { status: 403 })

						const { error: err } = await safe(async () =>
							update({ category, key, langs }, { event }),
						).asObject()
						if (err) return json({ message: "svelte-i18n.error_save_fail" }, { status: 500 })
						else {
							//! HACK: just nuke the cache on update
							cache.clear()
							return json({ message: "svelte-i18n.update_success" }, { status: 200 })
						}
					}

					break
				}
			}

			return resolve(event, {
				transformPageChunk({ html }) {
					const lang = ssrLangs.get(event.request) ?? fallbackLang
					return html.replaceAll("%svelte-i18n.lang%", lang)
				},
			})
		},
	}
}
