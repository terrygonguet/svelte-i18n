import tailwindcss from "@tailwindcss/vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { defineConfig, type Plugin } from "vite"
import { dataToEsm } from "@rollup/pluginutils"
import { Marked } from "marked"
import customHeadingId from "marked-custom-heading-id"
import { markedHighlight } from "marked-highlight"
import hljs from "highlight.js"
import { config } from "dotenv"

config()

export default defineConfig({
	plugins: [tailwindcss(), transformMD(), sveltekit()],
	server: {
		port: parseInt(process.env.PORT!) || undefined,
	},
	build: {
		sourcemap: true,
	},
})

function transformMD(): Plugin {
	const filenameRegex = /filename=(?<filename>\S+)/
	const marked = new Marked(
		{ async: false },
		customHeadingId(),
		markedHighlight({
			langPrefix: "language-",
			highlight(code, lang, info) {
				const language = hljs.getLanguage(lang) ? lang : "plaintext"
				const html = hljs.highlight(code, { language }).value

				const matched = filenameRegex.exec(info)
				if (matched?.groups) {
					const { filename } = matched.groups
					return '<p class="filename">' + filename + "</p>" + html
				} else return html
			},
		}),
		{
			renderer: {
				link({ href, tokens }) {
					const isExternal = href.startsWith("http")
					return `<a href="${href}" target="${isExternal ? "_blank" : "_self"}" class="text-teal-700 underline">${this.parser.parseInline(tokens)}</a>`
				},
			},
		},
	)
	return {
		name: "transform-markdown",
		transform(src, id) {
			if (id.endsWith(".md")) {
				const html = marked.parse(src)
				return {
					code: dataToEsm(html),
					map: null,
				}
			}
		},
	}
}
