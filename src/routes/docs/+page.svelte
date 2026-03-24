<script lang="ts">
	import "highlight.js/styles/vs2015.min.css"
	import { fadeParams } from "$minilib/transition.js"
	import { fade } from "svelte/transition"

	let { data } = $props()
	let { i18n } = $derived(data)
</script>

<svelte:head>
	<title>{i18n.t("docs", "page_title", { editor: false })}</title>
</svelte:head>

<main in:fade={fadeParams.in} out:fade={fadeParams.out} class="py-12">
	<div class="prose mx-auto w-full">
		{@html i18n.c(data.content, {
			url: `https://github.com/terrygonguet/svelte-i18n/blob/main/src/content/${i18n.lang}/docs.md`,
		})}
	</div>
</main>
