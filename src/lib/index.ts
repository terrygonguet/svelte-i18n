import type { SvelteI18NEditor, SvelteI18NEditorConfig } from "$lib/editor.svelte.js"
import type { SvelteI18NServerBundle, TranslationCategory } from "$lib/server.js"
import { safe } from "@terrygonguet/utils/result"
import { createSubscriber } from "svelte/reactivity"

export interface SvelteI18NConstructorOptions {
	lang: string | (() => string)
	supportedLangs: string[] | (() => string[])
	fallbackLang: string | (() => string)
	fetchCategory: SvelteI18NServerBundle["fetchCategory"]
	fetchAll?: SvelteI18NServerBundle["fetchAll"]
	updateKey?: SvelteI18NServerBundle["updateKey"]
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

	#fetchCategory: SvelteI18NServerBundle["fetchCategory"]
	#fetchAll?: SvelteI18NServerBundle["fetchAll"]
	#updateKey?: SvelteI18NServerBundle["updateKey"]

	#cache = new Map<string, TranslationCategory>()
	#cacheSubscribe: ReturnType<typeof createSubscriber>
	#cacheChange = () => {}

	#editor?: SvelteI18NEditor
	#editorSubscibe: ReturnType<typeof createSubscriber>
	#editorChange = () => {}
	get isEditorShown() {
		this.#editorSubscibe()
		return !!this.#editor
	}

	constructor({
		lang,
		supportedLangs,
		fallbackLang,
		fetchCategory,
		fetchAll,
		updateKey,
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

		if (!this.#supportedLangs.includes(this.#fallbackLang)) {
			console.warn(
				"[svelte-i18n] The fallback language is not in the list of supported languages",
				{
					fallbackLang: this.#fallbackLang,
					supportedLangs: this.#supportedLangs,
				},
			)
		}

		this.#fetchCategory = fetchCategory
		this.#fetchAll = fetchAll
		this.#updateKey = updateKey

		this.#editorSubscibe = createSubscriber((update) => (this.#editorChange = update))
		this.#langSubscribe = createSubscriber((update) => (this.#langChange = update))
		this.#cacheSubscribe = createSubscriber((update) => (this.#cacheChange = update))
	}

	async load(
		category: Extract<keyof T, string>,
		{ lang = this.#lang, skipIfCached = false } = {},
	): Promise<TranslationCategory | null> {
		const cacheKey = lang + "." + category
		const cached = this.#cache.get(cacheKey)
		if (cached && skipIfCached) return cached

		const [err, data] = await safe(async () => this.#fetchCategory!({ lang, category })).asTuple()

		if (err) {
			console.error("[svelte-i18n] Failed to load translations", { category, lang }, err)
			return null
		} else {
			this.#cache.set(cacheKey, data)
			this.#cacheChange()
			return data
		}
	}

	async loadAll({ langs = "all" }: { langs?: "all" | string[] } = {}) {
		if (!this.#fetchAll) throw new Error("svelte-i18n.error_fetchAll_unavailable")

		const [err, data] = await safe(async () =>
			this.#fetchAll!({ langs, categories: "all" }),
		).asTuple()

		if (err) {
			console.error("[svelte-i18n] Failed to load all translations", { langs }, err)
			return null
		} else {
			for (const [lang, categories] of Object.entries(data)) {
				for (const [category, pairs] of Object.entries(categories)) {
					this.#cache.set(lang + "." + category, pairs)
				}
			}
			this.#cacheChange()
			return data
		}
	}

	async update(data: {
		category: Extract<keyof T, string>
		key: string
		langs: { [lang: string]: string }
	}) {
		if (!this.#updateKey) throw new Error("svelte-i18n.error_update_unavailable")

		const [err, updated] = await safe(async () => this.#updateKey!(data)).asTuple()
		if (err) console.error("[svelte-i18n] Failed to update translations", data, err)
		else {
			for (const [lang, categories] of Object.entries(updated)) {
				for (const [category, pairs] of Object.entries(categories)) {
					this.#cache.set(lang + "." + category, pairs)
				}
			}
			this.#cacheChange()
		}
	}

	async setLang(lang: string) {
		if (this.#lang == lang) return

		const toLoad: Extract<keyof T, string>[] = []
		for (const category of this.categoriesInUse) {
			if (!this.#cache.has(lang + "." + category)) toLoad.push(category)
		}
		if (toLoad.length > 0)
			await Promise.all(toLoad.map((category) => this.load(category, { lang })))

		this.#lang = lang
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
	}

	hideEditor() {
		if (this.#editor) {
			this.#editor.destroy()
			this.#editor = undefined
			this.#editorChange()
		}
	}
}
