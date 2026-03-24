<script module lang="ts">
	export type EditorOpenRadio = Radio<
		[
			| {
					type: "translation"
					category: string
					key: string
					values: NonNullable<TOptions["values"]>
					multiline: boolean
					anchorEl?: HTMLElement
			  }
			| { type: "content"; url?: string },
		]
	>

	export type EditorCloseRadio = Radio<[], string>

	export interface Props {
		autoload?: boolean
		open: EditorOpenRadio["reciever"]
		close: EditorCloseRadio["reciever"]
		onChange?(): void
	}
</script>

<script lang="ts">
	import I18NEditorContent from "./I18NEditorContent.svelte"
	import I18NEditorOnSign from "./I18NEditorOnSign.svelte"
	import I18NEditorSeeAll from "./I18NEditorSeeAll.svelte"
	import I18NEditorTranslation from "./I18NEditorTranslation.svelte"
	import { safe } from "@terrygonguet/utils/result"
	import { getContext, tick, untrack } from "svelte"
	import type { Radio } from "./radio.js"
	import { type TOptions, type SvelteI18N } from "./index.js"

	let { autoload = false, open, close, onChange }: Props = $props()

	let i18n = getContext<SvelteI18N>("i18n")
	let t = $derived(i18n.withDefaults({ editor: false, autoload }))

	type Mode =
		| {
				type: "translation"
				category: string
				key: string
				values?: TOptions["values"]
				multiline?: { selected: string }
		  }
		| { type: "content"; url?: string }
		| { type: "see-all"; search: string }
		| { type: never }

	// impossible start state to force recomputing on first open
	let mode = $state<Mode>({ type: "initial" as never })
	let dialogEl = $state<HTMLDialogElement>()!

	let anchorEl = $state<HTMLElement>()
	let scrollY = $state(0)
	let targetRect = $derived(
		anchorEl
			? getChildrenBoundingRect(anchorEl)
			: new DOMRect(innerWidth / 2, innerHeight / 3, 0, 0),
	)
	let placementMode: "under" | "above" = $derived(
		targetRect.top > innerHeight / 2 ? "above" : "under",
	)
	let targetX = $derived(Math.round(targetRect.left + targetRect.width / 2))
	let targetY = $derived(
		Math.round(
			untrack(() => scrollY) + (placementMode == "above" ? targetRect.top : targetRect.bottom),
		),
	)
	let transform = $derived(
		placementMode == "under"
			? `translate(calc(${targetX}px - 50%), calc(${targetY}px + 1rem))`
			: `translate(calc(${targetX}px - 50%), calc(${targetY}px - 100% - 1rem))`,
	)

	$effect(() =>
		open((args) => {
			switch (args.type) {
				case "translation":
					anchorEl = args.anchorEl
					mode = {
						type: "translation",
						category: args.category,
						key: args.key,
						values: args.values,
						multiline: args.multiline ? { selected: i18n.lang } : undefined,
					}
					tick().then(() => dialogEl.showModal())
					break
				case "content":
					anchorEl = undefined
					mode = { type: "content", url: args.url }
					tick().then(() => dialogEl.showModal())
					break
			}
		}),
	)
	$effect(() =>
		close(() => {
			dialogEl.close()
			return dialogEl.returnValue ?? ""
		}),
	)

	function getChildrenBoundingRect(element: HTMLElement) {
		const range = document.createRange()
		range.selectNode(element)
		return range.getBoundingClientRect()
	}

	async function onSaveTranslation(
		category: string,
		key: string,
		langs: { [lang: string]: string },
	) {
		const [err, response] = await safe(() =>
			fetch("/locale/all.json", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ category, key, langs }),
			}),
		)
			.andThen((res) => res.json())
			.asTuple()

		if (err) console.error(err)
		else if (
			response &&
			typeof response == "object" &&
			response.message == "svelte-i18n.update_success"
		) {
			i18n.loadAll().then(() => onChange?.())
			dialogEl.close()
		}
	}

	function onSeeAllClick() {
		anchorEl = undefined
		mode = { type: "see-all", search: "" }
		tick().then(() => dialogEl.showModal())
	}

	function onSeeAllKeyClick(category: string, key: string) {
		mode = {
			type: "translation",
			category,
			key,
		}
	}

	function onDialogClick(evt: Event) {
		if (evt.target == evt.currentTarget) dialogEl.close()
	}
</script>

<svelte:window bind:scrollY />

<I18NEditorOnSign {autoload} onSeeAll={onSeeAllClick}></I18NEditorOnSign>

<dialog
	bind:this={dialogEl}
	id="i18n-editor"
	class:i18n-editor-big={mode.type == "see-all"}
	style:transform
	onclick={onDialogClick}
>
	{#if mode.type == "see-all"}
		<I18NEditorSeeAll {autoload} bind:search={mode.search} onKeyClick={onSeeAllKeyClick}
		></I18NEditorSeeAll>
	{:else if mode.type == "translation"}
		{@const { category, key, values, multiline } = mode}
		<I18NEditorTranslation
			{autoload}
			{category}
			{key}
			{values}
			{multiline}
			onSave={(pairs) => onSaveTranslation(category, key, pairs)}
		></I18NEditorTranslation>
	{:else if mode.type == "content"}
		<I18NEditorContent {autoload} url={mode.url}></I18NEditorContent>
	{/if}
</dialog>

<style>
	:global {
		.i18n-fragment {
			display: contents;
		}

		:where(#i18n-editor-on-sign, dialog#i18n-editor) {
			&,
			& * {
				box-sizing: border-box;
				margin: 0;
				padding: 0;
			}

			input,
			button,
			code {
				border: none;
				background-color: transparent;
				font-size: inherit;
				color: inherit;
			}
		}
	}

	dialog#i18n-editor {
		--i18n-editor-dialog-border-color: oklch(85.5% 0.138 181.071);
		--i18n-editor-dialog-backdrop: oklch(98.4% 0.014 180.72 / 50%);
		--i18n-editor-title-bg: oklch(95.3% 0.051 180.801);
		--i18n-editor-save-bg: oklch(95.3% 0.051 180.801);
		--i18n-editor-save-bg-hover: oklch(98.4% 0.014 180.72);
		--i18n-editor-content-url-color: oklch(51.1% 0.096 186.391);
		--i18n-editor-indicator-current: oklch(51.1% 0.096 186.391);
		--i18n-editor-indicator-fallback: oklch(45.7% 0.24 277.023);
		--i18n-editor-font-mono:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
			monospace;

		position: absolute;
		top: 0;
		left: 0;
		border: 1px solid var(--i18n-editor-dialog-border-color);
		font-family: sans-serif;

		&::backdrop {
			background-color: var(--i18n-editor-dialog-backdrop);
		}

		& > :global(*) {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: 1rem;
			min-width: 28rem;
			max-width: 40dvi;
		}

		&.i18n-editor-big > :global(*) {
			width: 100dvi;
		}
	}
</style>
