import { dev } from "$app/environment"
import { error } from "@sveltejs/kit"
import { db, schema } from "../db/index.js"
import { createSvelteI18NServerBundle } from "@terrygonguet/svelte-i18n/server"
import { and, eq, inArray, sql } from "drizzle-orm"

const { handle, fetchAll, fetchCategory, updateKey } = createSvelteI18NServerBundle({
	async fetchData({ where: { langs, categories } }) {
		console.log("fetchData", { langs, categories })
		const langsWhere = langs == "all" ? undefined : inArray(schema.translations.lang, langs)
		const categoriesWhere =
			categories == "all" ? undefined : inArray(schema.translations.category, categories)
		const where =
			categoriesWhere && langsWhere
				? and(categoriesWhere, langsWhere)
				: (categoriesWhere ?? langsWhere)

		const data = await db.query.translations.findMany({
			where,
			columns: { lang: true, category: true, key: true, value: true },
		})

		if (data.length == 0) return undefined

		const obj: { [lang: string]: { [category: string]: { [key: string]: string } } } = {}
		for (const { lang, category, key, value } of data) {
			const objLang = obj[lang] ?? {}
			obj[lang] = objLang
			const objCategory = objLang[category] ?? {}
			objLang[category] = objCategory
			objCategory[key] = value
		}

		return obj
	},
	async updateData({ category, key, langs }) {
		if (!dev) error(503, "svelte-i18n.error_save_unavailable")

		console.log("update", { category, key, langs })
		const insertValues: (typeof schema.translations.$inferInsert)[] = []
		for (const [lang, value] of Object.entries(langs)) {
			if (!value) {
				db.delete(schema.translations)
					.where(
						and(
							eq(schema.translations.lang, lang),
							eq(schema.translations.category, category),
							eq(schema.translations.key, key),
						),
					)
					.run()
			} else insertValues.push({ lang, category, key, value })
		}

		db.insert(schema.translations)
			.values(insertValues)
			.onConflictDoUpdate({
				target: [schema.translations.lang, schema.translations.category, schema.translations.key],
				set: { value: sql`excluded.value` },
			})
			.run()
	},
	getLang({ locals }) {
		return locals.lang
	},
})

export { handle, fetchAll, fetchCategory, updateKey }
