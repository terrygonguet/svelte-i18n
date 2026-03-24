<script lang="ts">
	import type { SvelteI18N } from "@terrygonguet/svelte-i18n"
	import { getContext } from "svelte"

	interface Props {
		autoload?: boolean
		onSeeAll(): void
	}

	let { autoload = false, onSeeAll }: Props = $props()

	let i18n = getContext<SvelteI18N>("i18n")
	let t = $derived(i18n.withDefaults({ editor: false, autoload }))

	let seeAllSide = $state<"end" | "start">("end")

	function onSeeAllSwitchClick() {
		seeAllSide = seeAllSide == "end" ? "start" : "end"
	}
</script>

<div id="i18n-editor-on-sign">
	<aside data-side={seeAllSide}>
		<button id="i18n-editor-see-all" onclick={() => onSeeAll()}>
			{t("svelte-i18n", "see_all", { overrideMissing: "See all" })}
		</button>
		<button
			aria-label={t("svelte-i18n", "see_all_switch", { overrideMissing: "Switch side" })}
			onclick={onSeeAllSwitchClick}
		>
			<!-- Icon from https://icons.mono.company -->
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
				<path
					d="M14.2929 2.29289C14.6834 1.90237 15.3166 1.90237 15.7071 2.29289L19.7071 6.29289C20.0976 6.68342 20.0976 7.31658 19.7071 7.70711L15.7071 11.7071C15.3166 12.0976 14.6834 12.0976 14.2929 11.7071C13.9024 11.3166 13.9024 10.6834 14.2929 10.2929L16.5858 8L5 8C4.44772 8 4 7.55228 4 7C4 6.44771 4.44772 6 5 6L16.5858 6L14.2929 3.70711C13.9024 3.31658 13.9024 2.68342 14.2929 2.29289ZM9.70711 12.2929C10.0976 12.6834 10.0976 13.3166 9.70711 13.7071L7.41421 16H19C19.5523 16 20 16.4477 20 17C20 17.5523 19.5523 18 19 18H7.41421L9.70711 20.2929C10.0976 20.6834 10.0976 21.3166 9.70711 21.7071C9.31658 22.0976 8.68342 22.0976 8.29289 21.7071L4.29289 17.7071C4.10536 17.5196 4 17.2652 4 17C4 16.7348 4.10536 16.4804 4.29289 16.2929L8.29289 12.2929C8.68342 11.9024 9.31658 11.9024 9.70711 12.2929Z"
				></path>
			</svg>
		</button>
	</aside>
</div>

<style>
	#i18n-editor-on-sign {
		--i18n-editor-sign-border-color: oklch(70.4% 0.14 182.503);
		--i18n-editor-sign-color: oklch(98.4% 0.014 180.72);
		--i18n-editor-sign-border-width: 8px;

		pointer-events: none;
		position: fixed;
		inset: 0;
		z-index: 50;
		border: var(--i18n-editor-sign-border-width) solid var(--i18n-editor-sign-border-color);
		color: var(--i18n-editor-sign-color);

		aside {
			pointer-events: all;
			position: absolute;
			inset-block-start: 0;
			background-color: var(--i18n-editor-sign-border-color);
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			padding-block-end: 1.5rem;
		}
		aside[data-side="end"] {
			inset-inline-end: 0;
			clip-path: polygon(0 0, 100% 0, 100% 100%, 0 calc(100% - 1.25rem));
		}
		aside[data-side="start"] {
			inset-inline-start: 0;
			clip-path: polygon(0 0, 100% 0, 100% calc(100% - 1.25rem), 0 100%);
		}

		button {
			cursor: pointer;
			padding: 0.25rem 0.75rem;
		}
		#i18n-editor-see-all {
			width: min-content;
			font-size: 0.875rem;
			line-height: 1.25;
		}

		svg {
			height: 1.2rem;
			fill: currentColor;
			margin-inline: auto;
		}
	}
</style>
