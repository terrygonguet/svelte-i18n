import type { SvelteI18NEditor, SvelteI18NEditorConfig } from "$lib/editor.svelte.js"
import type { TranslationCategory, TranslationLanguage, Translations } from "$lib/server.js"
import { AsyncResult, safe } from "@terrygonguet/utils/result"
import { hydratable } from "svelte"
import { createSubscriber } from "svelte/reactivity"

export interface SvelteI18NConstructorOptions {
	lang: string | (() => string)
	supportedLangs: string[] | (() => string[])
	fallbackLang: string | (() => string)
	fetch: typeof fetch
	id?: Symbol
}

export interface TOptions {
	autoload?: boolean
	editor?: boolean | SvelteI18NEditorConfig
	lang?: string
	overrideMissing?: string
	values?: { [name: string]: TValue | undefined }
}

export type TValue =
	| string
	| number
	| boolean
	| { prefix?: string; visible: string | number | boolean; suffix?: string }

export class SvelteI18N<T extends { [category: string]: string } = any> {
	fetch: typeof fetch

	#editor?: SvelteI18NEditor
	#editorSubscibe: ReturnType<typeof createSubscriber>
	#editorChange = () => {}
	get isEditorShown() {
		this.#editorSubscibe()
		return !!this.#editor
	}

	#lang: string
	#langSubscribe: ReturnType<typeof createSubscriber>
	#langChange = () => {}
	get lang() {
		this.#langSubscribe()
		return this.#lang
	}

	#supportedLangs: string[]
	get supportedLangs() {
		return this.#supportedLangs
	}

	#fallbackLang: string
	get fallbackLang() {
		return this.#fallbackLang
	}

	#categoriesInUse = new Set<Extract<keyof T, string>>()
	get categoriesInUse() {
		return this.#categoriesInUse
	}

	#keysInUse = new Set<string>()
	get keysInUse(): IteratorObject<[category: string, key: string]> {
		return this.#keysInUse.values().map((encoded) => JSON.parse(encoded))
	}

	#cache = new Map<string, TranslationCategory>()
	#cacheSubscribe: ReturnType<typeof createSubscriber>
	#cacheChange = () => {}
	get isCacheEmpty() {
		return this.#cache.size == 0
	}

	#inFlight = new Map<string, AsyncResult<Error, TranslationCategory>>()
	#inFlightAll?: AsyncResult<Error, Translations>

	constructor({ lang, supportedLangs, fallbackLang, fetch }: SvelteI18NConstructorOptions) {
		this.#lang = typeof lang == "string" ? lang : lang()
		this.#supportedLangs = Array.isArray(supportedLangs) ? supportedLangs : supportedLangs()
		this.#fallbackLang = typeof fallbackLang == "string" ? fallbackLang : fallbackLang()

		if (!this.#supportedLangs.includes(this.#lang)) {
			console.warn(
				"[svelte-i18n] The selected language is not in the list of supported languages, falling back",
				{
					lang: this.#lang,
					fallbackLang: this.#fallbackLang,
					supportedLangs: this.#supportedLangs,
				},
			)
			this.#lang = this.#fallbackLang
		}

		if (!this.#supportedLangs.includes(this.#fallbackLang))
			console.warn(
				"[svelte-i18n] The fallback language is not in the list of supported languages",
				{
					fallbackLang: this.#fallbackLang,
					supportedLangs: this.#supportedLangs,
				},
			)

		this.fetch = fetch
		this.#editorSubscibe = createSubscriber((update) => (this.#editorChange = update))
		this.#langSubscribe = createSubscriber((update) => (this.#langChange = update))
		this.#cacheSubscribe = createSubscriber((update) => (this.#cacheChange = update))
	}

	async load(
		category: Extract<keyof T, string>,
		{ lang = this.#lang, skipIfCached = false } = {},
	): Promise<TranslationCategory | null> {
		const cacheKey = lang + "." + category

		if (this.#inFlightAll) {
			const [err, translations] = await this.#inFlightAll.asTuple()
			if (err) return null
			else return translations[lang]?.[category] ?? null
		}

		const inFlight = this.#inFlight.get(cacheKey)
		if (inFlight) {
			const [err, category] = await inFlight.asTuple()
			if (err) return null
			else return category
		}

		const cached = this.#cache.get(cacheKey)
		if (cached && skipIfCached) return cached

		const [err, data] = await hydratable("svelte-i18n:" + cacheKey, async () => {
			const result = safe(() => this.fetch(`/locale/${lang}/${category}.json`))
				.andThen(async (res) => ({ ok: res.ok, data: await res.json() }))
				.andThen(({ ok, data }) => {
					// TODO better error and schema validation
					if (!ok) throw new Error(data.message)
					else return data as TranslationCategory
				})
			this.#inFlight.set(cacheKey, result)
			return result.asTuple()
		})

		if (err) {
			console.error("[svelte-i18n] Failed to load translations", { category, lang }, err)
			this.#cacheChange()
			return null
		} else {
			// we only delete successful results and use errors as a "failed" list
			this.#inFlight.delete(cacheKey)
			this.#cache.set(cacheKey, data)
			this.#cacheChange()
			return data
		}
	}

	async loadAll({
		categories,
		langs,
	}: {
		categories?: Extract<keyof T, string>[]
		langs?: string[]
	} = {}): Promise<Translations | null> {
		const search = new URLSearchParams()
		if (categories?.length) search.set("categories", categories.join(","))
		if (langs?.length) search.set("langs", langs.join(","))

		if (this.#inFlightAll) {
			const [err, translations] = await this.#inFlightAll.asTuple()
			if (err) return null
			else return translations ?? null
		}

		const url = "/locale/all.json" + (search.size ? "?" + search : "")
		const [err, data] = await hydratable("svelte-i18n:all", async () => {
			const result = safe(() => this.fetch(url)).andThen((res) => res.json())
			this.#inFlightAll = result
			return result.asTuple()
		})

		if (err) {
			console.error("[svelte-i18n] Failed to load all translations", { categories, langs }, err)
			this.#cacheChange()
			return null
		}

		for (const [lang, categories] of Object.entries<TranslationLanguage>(data)) {
			for (const [category, keys] of Object.entries(categories)) {
				const cacheKey = lang + "." + category
				this.#cache.set(cacheKey, keys)
			}
		}

		this.#cacheChange()
		return data
	}

	async setLang(lang: string) {
		if (this.#lang == lang) return
		const toLoad: Extract<keyof T, string>[] = []
		for (const category of this.categoriesInUse) {
			if (!this.#cache.has(lang + "." + category)) toLoad.push(category)
		}
		this.#lang = lang
		if (toLoad.length > 0) await this.loadAll({ categories: toLoad, langs: [lang] })
		this.#langChange()
	}

	get t() {
		return this.translate
	}
	async translate<Category extends Extract<keyof T, string>, Key extends T[Category]>(
		category: Category,
		key: Key,
		options: TOptions = {},
	): Promise<string> {
		const {
			autoload = true,
			editor = true,
			lang = this.#lang,
			overrideMissing = "I18N_MISSING_KEY",
			values = {},
		} = options

		if (category != "svelte-i18n") {
			this.categoriesInUse.add(category)
			//! HACK geez I sure wish I had a record or a tuple...
			this.#keysInUse.add(JSON.stringify([category, key]))
		}

		this.#cacheSubscribe()
		this.#langSubscribe()
		this.#editorSubscibe()

		let translations = this.#cache.get(lang + "." + category) ?? null
		if (!translations && autoload) translations = await this.load(category, { lang })

		let text = translations?.[key]
		if (typeof text == "string") text = await this.interpolate(text, values, options)
		else {
			// 1. try fallback lang
			if (lang != this.#fallbackLang)
				text = await this.t(category, key, { ...options, lang: this.#fallbackLang })
			// 2. key is fully missing
			else text = overrideMissing
		}

		return this.#editor && editor
			? this.#editor.renderTranslation(
					text,
					category,
					key,
					values,
					typeof editor == "object" ? editor : undefined,
				)
			: text
	}

	async raw<Category extends Extract<keyof T, string>, Key extends T[Category]>(
		category: Category,
		key: Key,
		{ lang = this.#lang, autoload = false, allowFallbackLang = false } = {},
	): Promise<string | null> {
		if (category != "svelte-i18n") {
			this.categoriesInUse.add(category)
			//! HACK geez I sure wish I had a record or a tuple...
			this.#keysInUse.add(JSON.stringify([category, key]))
		}

		this.#cacheSubscribe()
		this.#langSubscribe()

		let translations = this.#cache.get(lang + "." + category) ?? null
		if (!translations && autoload) translations = await this.load(category, { lang })

		let text = translations?.[key]
		if (typeof text == "string") return text
		else if (lang != this.#fallbackLang && allowFallbackLang)
			return this.raw(category, key, { autoload, lang: this.#fallbackLang })
		else return null
	}

	async rawCategory(
		category: Extract<keyof T, string>,
		{ lang = this.#lang, autoload = false, allowFallbackLang = false } = {},
	): Promise<TranslationCategory | null> {
		if (category != "svelte-i18n") this.categoriesInUse.add(category)

		this.#cacheSubscribe()
		this.#langSubscribe()

		let translations = this.#cache.get(lang + "." + category) ?? null
		if (!translations && autoload) translations = await this.load(category, { lang })

		if (translations) return translations
		else if (lang != this.#fallbackLang && allowFallbackLang)
			return this.rawCategory(category, {
				lang: this.#fallbackLang,
				autoload,
				allowFallbackLang: false,
			})
		else return null
	}

	static #regex_$t = /^\$t\s+(?<category>\S+)\.(?<key>\S+)(?:\s(?<lang>\S+))?$/
	static #regex_$match = /^\$match\s+(?<varname>\S+)\s+(?<patterns>.+)$/
	static #regex_$if = /^\$if\s+(?<varname>\S+)\s+(?<true>.+?)(?:\s+\$else\s+(?<false>.+))?$/
	static #regex_base = /^(?<varname>\S+)$/

	async interpolate(
		text: string,
		values: NonNullable<TOptions["values"]>,
		options: Pick<TOptions, "autoload" | "lang" | "overrideMissing"> = {},
	): Promise<string> {
		let start = 0
		let end = 0
		let lastEnd = 0
		let result = ""
		while ((start = text.indexOf("{{", lastEnd)) != -1) {
			end = text.indexOf("}}", start)
			if (end == -1) break
			let value = ""
			const expr = text.slice(start + 2, end).trim()

			let match: RegExpExecArray | null = null
			if ((match = SvelteI18N.#regex_$t.exec(expr))) {
				const { category, key, lang = this.#lang } = match.groups!
				value = await this.t<any, any>(category, key, { ...options, editor: false, values, lang })
			} else if ((match = SvelteI18N.#regex_$match.exec(expr))) {
				const { varname = "", patterns = "" } = match.groups!
				const matches = Array.from(patterns.matchAll(/(?<amount>[\w_]):/g))
				const rules: { [amount: string]: string } = {}
				for (let i = 0; i < matches.length; i++) {
					const { 0: match, groups, index = 0 } = matches[i]!
					const { amount = "_" } = groups!
					const start = index + match.length
					const end = matches[i + 1]?.index
					const rule = patterns.slice(start, end)
					rules[amount] = rule.trim()
				}

				const tvalue = values[varname]
				let matchResult: string | undefined
				if (tvalue == undefined) {
					console.error(`[svelte-i18n] Failed to interpolate $match: missing "${varname}" value`, {
						expression: expr,
						values,
					})
				} else {
					if (typeof tvalue == "object")
						matchResult = rules[tvalue.visible.toString()] ?? rules["_"]
					else matchResult = rules[tvalue.toString()] ?? rules["_"]

					if (matchResult == undefined) {
						console.warn("[svelte-i18n] Tried to interpolate a $match without a default case", {
							expression: expr,
							values,
						})
						matchResult = ""
					}

					if (typeof tvalue == "object")
						value = (tvalue.prefix ?? "") + matchResult + (tvalue.suffix ?? "")
					else value = matchResult
				}
			} else if ((match = SvelteI18N.#regex_base.exec(expr))) {
				const { varname = "" } = match.groups!
				const tvalue = values[varname]
				if (typeof tvalue == "object")
					value = (tvalue.prefix ?? "") + tvalue.visible + (tvalue.suffix ?? "")
				else if (tvalue != undefined) value = tvalue.toString()
				else
					console.warn("[svelte-i18n] Tried to interpolate missing value", {
						expression: expr,
						values,
					})
			} else if ((match = SvelteI18N.#regex_$if.exec(expr))) {
				const { varname = "", true: ifTrue = "", false: ifFalse = "" } = match.groups!
				const tvalue = values[varname]
				if (typeof tvalue == "object")
					value =
						(tvalue.prefix ?? "") + (tvalue.visible ? ifTrue : ifFalse) + (tvalue.suffix ?? "")
				else if (tvalue != undefined) value = tvalue ? ifTrue : ifFalse
				else
					console.warn("[svelte-i18n] Tried to interpolate missing value", {
						expression: expr,
						values,
					})
			} else {
				console.error("[auto-18n] Failed to interpolate: could not understand expression", {
					expression: expr,
					values,
				})
				value = "I18N_INTERPOLATE_ERROR"
			}
			result += text.slice(lastEnd, start) + value
			lastEnd = end + 2
		}
		return result + text.slice(lastEnd)
	}

	get c() {
		return this.content
	}
	content(
		content: string,
		{ editor = true, url }: { editor?: TOptions["editor"]; url?: string } = {},
	) {
		this.#editorSubscibe()
		return this.#editor && editor ? this.#editor.renderContent(content, { url }) : content
	}

	withDefaults(defaultOpts: TOptions): typeof this.t {
		return (category, key, opts = {}) => this.t(category, key, { ...defaultOpts, ...opts })
	}

	async showEditor({ autoload = false } = {}) {
		if (!this.#editor) {
			const { SvelteI18NEditor } = await import("./editor.svelte")
			this.#editor = new SvelteI18NEditor(this, { autoload })
			this.#editorChange()
		}
		await this.loadAll()
	}

	hideEditor() {
		if (this.#editor) {
			this.#editor.destroy()
			this.#editor = undefined
			this.#editorChange()
		}
	}
}
