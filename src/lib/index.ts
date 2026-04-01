import { safe } from "@terrygonguet/utils/result"
import { safeParse } from "@terrygonguet/utils/json"
import { createSubscriber } from "svelte/reactivity"
import type { SvelteI18NEditor, SvelteI18NEditorConfig } from "./editor.svelte"
import type { Translations } from "./server.js"

export interface SvelteI18NConstructorOptions {
	lang: string | (() => string)
	supportedLangs: string[] | (() => string[])
	fallbackLang: string | (() => string)
	fetch?: typeof fetch
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
	//#region static

	// cache is shared across all instances
	static #cache = new Map<string, Record<string, string>>()
	static #cacheSubscribe = createSubscriber((update) => (SvelteI18N.#cacheChange = update))
	static #cacheChange = () => {}
	static get isCacheEmpty() {
		return SvelteI18N.#cache.size == 0
	}

	static #failedCategories = new Set<string>()
	static #inFlight = new Set<string>()

	//! each instance must be accessible from static for to inline data after SSR
	static instances = new WeakMap<Symbol, SvelteI18N>()

	static async load(
		lang: string,
		category: string,
		{ fetch = globalThis.fetch, skipIfCached = false } = {},
	) {
		const cacheKey = lang + "." + category
		if (
			SvelteI18N.#failedCategories.has(cacheKey) ||
			SvelteI18N.#inFlight.has(cacheKey) ||
			SvelteI18N.#inFlight.has("all") ||
			(skipIfCached && SvelteI18N.#cache.has(cacheKey))
		)
			return

		SvelteI18N.#inFlight.add(cacheKey)
		const [err, data] = await safe(() => fetch(`/locale/${lang}/${category}.json`))
			.andThen(async (res) => ({ ok: res.ok, data: await res.json() }))
			.andThen(({ ok, data }) => {
				if (!ok) throw new Error(data.message)
				else return data
			})
			.asTuple()
		SvelteI18N.#inFlight.delete(cacheKey)

		if (err) {
			console.error("[svelte-i18n] Failed to load translations", { category, lang }, err)
			SvelteI18N.#failedCategories.add(cacheKey)
		} else {
			SvelteI18N.#cache.set(cacheKey, data)
		}
		SvelteI18N.#cacheChange()
	}

	static async loadAll({
		categories,
		langs,
		fetch = globalThis.fetch,
	}: {
		categories?: string[]
		langs?: string[]
		fetch?: typeof globalThis.fetch
	} = {}) {
		const search = new URLSearchParams()
		if (categories?.length) search.set("categories", categories.join(","))
		if (langs?.length) search.set("langs", langs.join(","))

		SvelteI18N.#inFlight.add("all")
		const url = "/locale/all.json" + (search.size ? "?" + search : "")
		const [err, data] = await safe(() => fetch(url))
			.andThen((res) => res.json())
			.asTuple()
		SvelteI18N.#inFlight.delete("all")
		if (err)
			console.error("[svelte-i18n] Failed to load all translations", { categories, langs }, err)

		for (const [lang, categories] of Object.entries<any>(data)) {
			for (const [category, keys] of Object.entries<any>(categories)) {
				const cacheKey = lang + "." + category
				SvelteI18N.#cache.set(cacheKey, keys)
			}
		}

		SvelteI18N.#cacheChange()
	}

	//#endregion

	id: Symbol
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
	// get categoriesInUse() {
	// 	const set = SvelteI18N.#categoriesInUse.get(this.fetch)
	// 	if (set) return set as Set<Extract<keyof T, string>>
	// 	else {
	// 		const set = new Set<string>()
	// 		SvelteI18N.#categoriesInUse.set(this.fetch, set)
	// 		return set as Set<Extract<keyof T, string>>
	// 	}
	// }

	#keysInUse = new Set<string>()
	get keysInUse(): IteratorObject<[category: string, key: string]> {
		return this.#keysInUse.values().map((encoded) => JSON.parse(encoded))
	}

	constructor({
		lang,
		supportedLangs,
		fallbackLang,
		id = Symbol("svelte-i18n:id"),
		fetch = globalThis.fetch,
	}: SvelteI18NConstructorOptions) {
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

		this.id = id
		this.fetch = fetch
		this.#editorSubscibe = createSubscriber((update) => (this.#editorChange = update))
		this.#langSubscribe = createSubscriber((update) => (this.#langChange = update))

		SvelteI18N.instances.set(id, this)
		this.#hydrate()
	}

	#hydrate() {
		if (!globalThis.document) return

		const script = document.querySelector(`script[type="application/json"]#svelte-i18n-data`)
		if (!script) return

		const seedData = safeParse<Translations>(script.innerHTML, {})
		for (const [lang, categories] of Object.entries(seedData)) {
			for (const [category, pairs] of Object.entries(categories)) {
				const cacheKey = lang + "." + category
				SvelteI18N.#cache.set(cacheKey, pairs)
			}
		}
	}

	load(category: Extract<keyof T, string>, { lang = this.#lang, skipIfCached = false } = {}) {
		return SvelteI18N.load(lang, category, { fetch: this.fetch, skipIfCached })
	}

	loadAll({
		categories,
		langs,
	}: { categories?: Extract<keyof T, string>[]; langs?: string[] } = {}) {
		return SvelteI18N.loadAll({ categories, langs, fetch: this.fetch })
	}

	async setLang(lang: string) {
		if (this.#lang == lang) return
		const toLoad: Extract<keyof T, string>[] = []
		for (const category of this.categoriesInUse) {
			if (!SvelteI18N.#cache.has(lang + "." + category)) toLoad.push(category)
		}
		this.#lang = lang
		if (toLoad.length > 0) await this.loadAll({ categories: toLoad, langs: [lang] })
		this.#langChange()
	}

	get t() {
		return this.translate
	}
	translate<Category extends Extract<keyof T, string>, Key extends T[Category]>(
		category: Category,
		key: Key,
		options: TOptions = {},
	): string {
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

		SvelteI18N.#cacheSubscribe()
		this.#langSubscribe()
		this.#editorSubscibe()

		const cacheKey = lang + "." + category
		const translations = SvelteI18N.#cache.get(cacheKey)
		if (!translations && autoload) this.load(category, { lang })

		let text = translations?.[key]
		if (text == undefined) {
			// 1. wait for the content to load
			if (SvelteI18N.#inFlight.has(cacheKey)) text = ""
			// 2. try fallback lang
			else if (lang != this.#fallbackLang)
				text = this.t(category, key, { ...options, lang: this.#fallbackLang })
			// 3. key is fully missing
			else text = overrideMissing
		} else text = this.interpolate(text, values, options)

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

	raw<Category extends Extract<keyof T, string>, Key extends T[Category]>(
		category: Category,
		key: Key,
		{ lang = this.#lang, autoload = false }: Pick<TOptions, "lang" | "autoload"> = {},
	) {
		SvelteI18N.#cacheSubscribe()
		const text = SvelteI18N.#cache.get(lang + "." + category)?.[key]
		if (text == undefined && autoload) this.load(category, { lang })
		return text
	}

	rawCategory(
		category: Extract<keyof T, string>,
		{ lang = this.#lang, autoload = false, includeFallback = false } = {},
	) {
		SvelteI18N.#cacheSubscribe()
		const cached = SvelteI18N.#cache.get(lang + "." + category)
		if (!cached && autoload) this.load(category, { lang })
		if (includeFallback) {
			const cachedFallback = SvelteI18N.#cache.get(this.#fallbackLang + "." + category)
			if (!cachedFallback && autoload) this.load(category, { lang: this.#fallbackLang })
			return { ...(cachedFallback ?? {}), ...(cached ?? {}) }
		} else return cached ?? {}
	}

	static #regex_$t = /^\$t\s+(?<category>\S+)\.(?<key>\S+)(?:\s(?<lang>\S+))?$/
	static #regex_$match = /^\$match\s+(?<varname>\S+)\s+(?<patterns>.+)$/
	static #regex_$if = /^\$if\s+(?<varname>\S+)\s+(?<true>.+?)(?:\s+\$else\s+(?<false>.+))?$/
	static #regex_base = /^(?<varname>\S+)$/

	interpolate(
		text: string,
		values: NonNullable<TOptions["values"]>,
		options: Pick<TOptions, "autoload" | "lang" | "overrideMissing"> = {},
	) {
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
				value = this.t<any, any>(category, key, { ...options, editor: false, values, lang })
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

	// TODO maybe make editor handling static too?
	async showEditor({ autoload = false } = {}) {
		if (!this.#editor) {
			const { SvelteI18NEditor } = await import("./editor.svelte")
			this.#editor = new SvelteI18NEditor(this, { autoload })
			this.#editorChange()
		}
		this.loadAll()
	}

	hideEditor() {
		if (this.#editor) {
			this.#editor.destroy()
			this.#editor = undefined
			this.#editorChange()
		}
	}
}
