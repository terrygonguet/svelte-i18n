import { drizzle } from "drizzle-orm/better-sqlite3"
import Database from "better-sqlite3"
import * as schema from "./schema.js"
import { env } from "$env/dynamic/private"

const client = new Database(env.DATABASE_URL ?? "svelte-i18n.sqlite")

export const db = drizzle(client, { schema })
export { schema }
