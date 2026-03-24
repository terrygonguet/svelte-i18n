import { env } from "$env/dynamic/private"
import { db, schema } from "$minilib/db/index.js"
import {
	createSvelteI18NHandle,
	type CreateSvelteI18NHandlerOptions,
} from "@terrygonguet/svelte-i18n/server"
import { and, eq, inArray, sql } from "drizzle-orm"

const fetchCategory: CreateSvelteI18NHandlerOptions["fetchCategory"] = async ({
	where: { lang, category },
}) => {
	console.log("fetchCategory", { lang, category })
	const pairs = await db.query.translations.findMany({
		columns: { key: true, value: true },
		where: (table, { and, eq }) => and(eq(table.lang, lang), eq(table.category, category)),
	})
	if (pairs.length == 0) return undefined
	else
		return pairs.reduce(
			(acc, { key, value }) => {
				acc[key] = value
				return acc
			},
			{} as Record<string, string>,
		)
}

const fetchAll: CreateSvelteI18NHandlerOptions["fetchAll"] = async ({
	where: { langs, categories },
}) => {
	console.log("fetchAll", { langs, categories })
	const langsWhere = langs?.length ? inArray(schema.translations.lang, langs) : undefined
	const categoriesWhere = categories?.length
		? inArray(schema.translations.category, categories)
		: undefined
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
}

const update: CreateSvelteI18NHandlerOptions["update"] = async ({ category, key, langs }) => {
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
}

export const i18nHandle = createSvelteI18NHandle({
	supportedLangs: env.SUPPORTED_LANGS.split(","),
	fallbackLang: env.FALLBACK_LANG,
	fetchCategory,
	fetchAll,
	update,
})
