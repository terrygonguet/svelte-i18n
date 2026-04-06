<script lang="ts">
	import { getContext } from "svelte"
	import type { SvelteI18N } from "./index.js"

	interface Props {
		autoload?: boolean
		search: string
		onKeyClick(category: string, key: string): void
	}

	let { search = $bindable(), autoload = false, onKeyClick }: Props = $props()

	let i18n = getContext<SvelteI18N>("i18n")
	let t = $derived(i18n.withDefaults({ editor: false, autoload }))

	function processKeysInUse(keysInUse: IteratorObject<[string, string]>, search: string) {
		return keysInUse
			.filter(([cat, key]) => (cat + "." + key).includes(search))
			.toArray()
			.sort(([catA, keyA], [catB, keyB]) => {
				const comp = catA.localeCompare(catB)
				if (comp == 0) return keyA.localeCompare(keyB)
				else return comp
			})
	}
</script>

<div>
	<h2 class="i18n-editor-title">
		{@html await t("svelte-i18n", "all_title", { overrideMissing: "All keys" })}
	</h2>
	<label for="i18n-editor-search">
		{await t("svelte-i18n", "search", { overrideMissing: "Search:" })}
		<input id="i18n-editor-search" bind:value={search} />
	</label>
	<ul id="i18n-editor-all-keys">
		{#each processKeysInUse(i18n.keysInUse, search) as [category, key]}
			<li>
				<button onclick={() => onKeyClick(category, key)}>
					<code>{category}.{key}</code>
					<span>{await i18n.raw(category, key, { autoload })}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	.i18n-editor-title {
		text-align: center;
		font-size: 1.25rem;
	}

	label[for="i18n-editor-search"] {
		display: flex;
		align-items: center;
		gap: 0.5rem;

		input {
			flex: 1;
		}
	}

	#i18n-editor-search {
		padding-inline: 0.25rem;
		border-block-end: 1px solid var(--i18n-editor-dialog-border-color);
		font-family: var(--i18n-editor-font-mono);
	}

	#i18n-editor-all-keys {
		max-height: 35dvb;
		overflow: auto;

		li button {
			display: flex;
			gap: 0.5rem;
			cursor: pointer;
			align-items: center;
		}

		li code {
			font-weight: bold;
			font-family: var(--i18n-editor-font-mono);
		}

		li span {
			flex: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			opacity: 0.5;
		}
	}
</style>
