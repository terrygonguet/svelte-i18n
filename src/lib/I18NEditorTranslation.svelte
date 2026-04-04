<script lang="ts">
	import { getContext, tick } from "svelte"
	import { type TOptions, type SvelteI18N } from "./index.js"

	interface Props {
		autoload?: boolean
		category: string
		key: string
		values?: TOptions["values"]
		multiline?: { selected: string }
		onSave(pairs: { [lang: string]: string }): void
	}

	let { autoload = false, category, key, values, multiline, onSave }: Props = $props()

	let i18n = getContext<SvelteI18N>("i18n")
	let t = $derived(i18n.withDefaults({ editor: false, autoload }))

	let hasValues = $derived(values && Object.keys(values).length > 0)

	function onSubmit(evt: SubmitEvent) {
		evt.preventDefault()

		const data = new FormData(evt.target as HTMLFormElement)
		const { category, key, ...langs } = Object.fromEntries(data)
		onSave(langs as any)
	}

	function onLabelClick(multiline: { selected: string }, lang: string) {
		return function () {
			multiline.selected = lang
			tick().then(() =>
				document.querySelector<HTMLTextAreaElement>("#i18n-editor-value-" + lang)?.focus(),
			)
		}
	}
</script>

<form onsubmit={onSubmit}>
	<h2 class="i18n-editor-title"><code>{category}.{key}</code></h2>
	<input name="category" value={category} type="hidden" required />
	<input name="key" value={key} type="hidden" required />

	{#if values == undefined}
		<p class="i18n-editor-subtitle">
			{@html await t("svelte-i18n", "no_values", { overrideMissing: "Values unavailable" })}
		</p>
	{:else if hasValues}
		<div id="i18n-editor-values">
			<p class="i18n-editor-subtitle">
				{await t("svelte-i18n", "title_values", { overrideMissing: "Values" })}
			</p>
			{#each Object.entries(values) as [name, value]}
				<code class="i18n-editor-values-name">{"{{" + name + "}}"}</code>
				<span>:</span>
				<span class="i18n-editor-values-value">
					{typeof value == "object" ? value.visible : value}
				</span>
			{/each}
		</div>
	{/if}

	{#if multiline}
		<div>
			{#if hasValues}
				<p class="i18n-editor-subtitle">
					{await t("svelte-i18n", "title_translations", { overrideMissing: "Translations" })}
				</p>
			{/if}
			<div id="i18n-editor-multiline">
				<div id="i18n-editor-multiline-tabs">
					{#each i18n.supportedLangs as lang}
						<button
							type="button"
							id="i18n-editor-label-{lang}"
							class="i18n-editor-multiline-tab"
							data-selected={lang == multiline.selected}
							onclick={onLabelClick(multiline, lang)}
						>
							<code>{lang}</code>
							{@render langIndicators(i18n, t, lang)}
						</button>
					{/each}
					<div id="i18n-editor-multiline-tabend"></div>
				</div>
				{#each i18n.supportedLangs as lang}
					{@const placeholder = await t("svelte-i18n", "value_placeholder", {
						overrideMissing: "Missing value",
					})}
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						name={lang}
						id="i18n-editor-value-{lang}"
						class="i18n-editor-multiline-value"
						aria-labelledby="i18n-editor-label-{lang}"
						data-selected={lang == multiline.selected}
						autofocus
						rows="5"
						{placeholder}>{await i18n.raw(category, key, { lang, autoload })}</textarea
					>
				{/each}
			</div>
		</div>
	{:else}
		<div id="i18n-editor-monoline">
			{#if hasValues}
				<p class="i18n-editor-subtitle">
					{await t("svelte-i18n", "title_translations", { overrideMissing: "Translations" })}
				</p>
			{/if}
			{#each i18n.supportedLangs as lang}
				<label for="i18n-editor-value-{lang}"><code>{lang}</code></label>
				<input
					id="i18-editor-value-{lang}"
					class="i18n-editor-monoline-value"
					name={lang}
					value={await i18n.raw(category, key, { lang, autoload })}
					placeholder={await t("svelte-i18n", "value_placeholder", {
						overrideMissing: "Missing value",
					})}
				/>
				<div id="i18n-editor-monoline-indicators">{@render langIndicators(i18n, t, lang)}</div>
			{/each}
		</div>
	{/if}

	<button type="submit" id="i18n-editor-save">
		{await t("svelte-i18n", "btn_save", { overrideMissing: "Save" })}
	</button>
</form>

{#snippet langIndicators(i18n: SvelteI18N, t: SvelteI18N["t"], lang: string)}
	{#if lang == i18n.lang}
		{@const label = await t("svelte-i18n", "lang_current", { overrideMissing: "Current" })}
		<span class="i18n-editor-indicator-cur" title={label}>{label.charAt(0)}</span>
	{/if}
	{#if lang == i18n.fallbackLang}
		{@const label = await t("svelte-i18n", "lang_fallback", { overrideMissing: "Fallback" })}
		<span class="i18n-editor-indicator-fb" title={label}>{label.charAt(0)}</span>
	{/if}
{/snippet}

<style>
	.i18n-editor-title {
		text-align: center;
		font-size: 1.25rem;

		> code {
			border-radius: 0.25rem;
			padding: 0.25rem 0.5rem;
			background-color: var(--i18n-editor-title-bg);
		}
	}

	.i18n-editor-subtitle {
		grid-column: span 3;
		text-align: center;
		text-decoration: underline;
		text-decoration-color: var(--i18n-editor-dialog-border-color);
	}

	#i18n-editor-values {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 0.5rem;
		width: 100%;
	}
	.i18n-editor-values-name {
		text-align: end;
	}
	.i18n-editor-values-value {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	#i18n-editor-multiline {
		display: grid;
	}
	#i18n-editor-multiline-tabs {
		display: flex;
	}

	.i18n-editor-multiline-tab {
		border: 1px solid var(--i18n-editor-dialog-border-color);
		border-inline-end: 0;
		padding: 0.25rem 0.5rem;

		&[data-selected="true"] {
			border-block-end: 0;
		}
	}

	#i18n-editor-multiline-tabend {
		flex: 1;
		border: 1px solid var(--i18n-editor-dialog-border-color);
		border-block-start: 0;
		border-inline-end: 0;
	}

	.i18n-editor-multiline-value {
		padding: 0.75rem;
		grid-column: 1;
		grid-row: 2;
		font-family: var(--i18n-editor-font-mono);
		border: 1px solid var(--i18n-editor-dialog-border-color);
		border-block-start: 0;
		outline: none;

		&[data-selected="false"] {
			display: none;
		}
	}

	#i18n-editor-monoline {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
	}

	.i18n-editor-monoline-value {
		padding-inline: 0.25rem;
		border-block-end: 1px solid var(--i18n-editor-dialog-border-color);
		font-family: var(--i18n-editor-font-mono);
	}

	#i18n-editor-monoline-indicators {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	#i18n-editor-save {
		display: block;
		padding-inline: 0.5rem;
		margin-inline: auto;
		cursor: pointer;
		border: 1px solid var(--i18n-editor-dialog-border-color);
		background-color: var(--i18n-editor-save-bg);
		transition: background-color 0.15s ease-in-out;

		&:is(:hover, :active) {
			background-color: var(--i18n-editor-save-bg-hover);
		}
	}

	.i18n-editor-indicator-cur {
		color: var(--i18n-editor-indicator-current);
		font-size: 0.875rem;
	}
	.i18n-editor-indicator-fb {
		color: var(--i18n-editor-indicator-fallback);
		font-size: 0.875rem;
	}
</style>
