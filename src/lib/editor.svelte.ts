import type { SvelteI18N, TOptions } from "./index.js"
import I18NEditorDialog, {
	type EditorCloseRadio,
	type EditorOpenRadio,
} from "./I18NEditorDialog.svelte"
import { mount, unmount } from "svelte"
import { createRadio } from "./radio.js"
import { on } from "svelte/events"
import { noop } from "@terrygonguet/utils"
import { safeParse } from "@terrygonguet/utils/json"

export { I18NEditorDialog }

const html = String.raw

export interface SvelteI18NEditorConfig {
	multiline?: boolean
}

export class SvelteI18NEditor {
	i18n: SvelteI18N

	#dialogOpenRadio: EditorOpenRadio = createRadio()
	#dialogCloseRadio: EditorCloseRadio = createRadio()
	#dialogEl: {}

	#onDestroy = noop

	constructor(i18n: SvelteI18N, { autoload = false } = {}) {
		this.i18n = i18n

		const off = on(
			document,
			"click",
			(evt) => {
				const fragment = (evt.target as Element).closest<HTMLElement>("div.i18n-fragment")
				if (fragment) {
					evt.stopPropagation()
					evt.preventDefault()
					this.showDialog(fragment)
				}
			},
			{ capture: true },
		)

		this.#dialogEl = mount(I18NEditorDialog, {
			target: document.body,
			context: new Map<string, any>([
				["editor", this],
				["i18n", this.i18n],
			]),
			props: {
				autoload,
				open: this.#dialogOpenRadio.reciever,
				close: this.#dialogCloseRadio.reciever,
			},
		})

		this.#onDestroy = () => {
			off()
			unmount(this.#dialogEl)
		}
	}

	renderTranslation(
		text: string,
		category: string,
		key: string,
		values: NonNullable<TOptions["values"]>,
		{ multiline = false }: SvelteI18NEditorConfig = {},
	) {
		return html`<div
			class="i18n-fragment"
			data-i18n-type="translation"
			data-i18n-category="${category}"
			data-i18n-key="${key}"
			data-i18n-values="${encodeURIComponent(JSON.stringify(values))}"
			${multiline ? "data-i18n-multiline" : ""}
		>
			${text}
		</div>`
	}

	renderContent(content: string, { url }: { url?: string }) {
		return html`<div
			class="i18n-fragment"
			data-i18n-type="content"
			${url ? 'data-i18n-url="' + url + '"' : ""}
		>
			${content}
		</div>`
	}

	showDialog(anchorEl: HTMLElement) {
		const {
			i18nType: type,
			i18nCategory: category,
			i18nKey: key,
			i18nValues,
			i18nUrl: url,
			i18nMultiline,
		} = anchorEl.dataset as Record<string, string>
		switch (type) {
			case "translation":
				const values = safeParse(decodeURIComponent(i18nValues), {})
				const multiline = typeof i18nMultiline == "string"
				this.#dialogOpenRadio.emitter({ type, category, key, values, multiline, anchorEl })
				break
			case "content":
				this.#dialogOpenRadio.emitter({ type, url })
				break
		}
	}

	destroy() {
		this.#onDestroy()
	}
}
