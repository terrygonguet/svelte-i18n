# Documentation

## Installation {#installation}

```sh
npm install @terrygonguet/svelte-i18n
```

## Usage {#usage}

Until the Svelte ecosystem agrees on a way to add plugins to SvelteKit, you'll have to integrate the different parts of `svelte-i18n` into your app yourself. Don't worry it's pretty easy 😉.

`svelte-i18n` makes extensive use of Svelte 5's reactivity primitives. All you have to do is use simple functions and we handle the auto loading and caching and acrobatics needed to have SSR and our cool editor. The function calls will be re-run whenever needed to keep your UI in sync.

Like a bikini, `svelte-i18n` comes in two parts: [client](#usage-client) and [server](#usage-server). The server part adds routes to your app so the client can load translations and send new ones. The client part serves as an internationalisation library and loads the editor for changing the translations.

### Server {#usage-server}

On the server most of the business happens in the `hooks.server.ts` file. You can import the `createSvelteI18NHandle` function from `@terrygonguet/svelte-i18n/server` and use it to create the titular handle function. This function is a fully self contained [handle](https://svelte.dev/docs/kit/@sveltejs-kit#Handle) hook and can be added to your app via the [sequence](https://svelte.dev/docs/kit/@sveltejs-kit-hooks#sequence) function.

```ts filename=hooks.server.ts
import { sequence } from "@sveltejs/kit/hooks"
import { createSvelteI18NHandle } from "@terrygonguet/svelte-i18n/server"

const i18nHandle = createSvelteI18NHandle({
	fetchCategory,
	canFetchCategory,
	fetchAll,
	canFetchAll,
	update,
	canUpdate,
})

export const handle = sequence(i18nHandle, ({ event, resolve }) => {
	// do your hook stuff
	return resolve(event)
})
```

You probably want to run this function after your session/authentication but before the rest of SvelteKit.

All the values passed to the `createSvelteI18NHandle` function are functions too. Those whose name start with "can" are guards, allowing you to grant or deny access to any part of the generated routes. The other functions are here to transfer data from your storage solution to the format that `svelte-i18n` expects. Please refer to the [API](#api) section for details.

### Client {#usage-client}

The client side is more involved. Fundamentally, all you have to do is create an instance of the `SvelteI18N` class and pass it around. Your components can then use the `translate()` (aliased to `t()`) method to display the translation strings.

As usual, everything gets more complex when we take SSR into account. The recommended flow is to have a `layout.server.ts` file to resolve which language to display to the user; a `layout.ts` file to create the `SvelteI18N` instance that will be available throughout your application and now you can use [`page.data`](https://svelte.dev/docs/kit/@sveltejs-kit#Page) or [`$props().data`](https://svelte.dev/docs/kit/load#Page-data) (for pages) to get your translation strings anywhere.

```ts filename=layout.server.ts
export const load = async ({ cookies, request }) => {
	// do whatever you want to get the user's language settings
	return { lang, supportedLangs, fallbackLang }
}
```

```ts filename=layout.ts
export const load = async ({ fetch, data: { lang, supportedLangs, fallbackLang } }) => {
	const i18n = new SvelteI18N({ lang, supportedLangs, fallbackLang, fetch })
	return { i18n, t: i18n.t.bind(i18n), c: i18n.c.bind(i18n) }
}
```

```html filename=+page.svelte
<script lang="ts">
	let { data } = $props()
	let { t } = $derived(data)
</script>

<p>{@html t("category", "key")}</p>
```

```html filename=Component.svelte
<script lang="ts">
	import { page } from "$app/state"

	let { t } = $derived(page.data)
</script>

<p>{@html t("category", "key")}</p>
```

From there, you can write whatever code you want to trigger `i18n.showEditor()` to show [the editor](#editor) UI (simple button, shortcut keybinds etc).

## Interpolation {#interpolation}

Static strings are not enough to fully localize an application, some parts of the text must be dynamic. To that end, `svelte-i18n` has a few interpolation utilities.

### Simple value insertion `{{name}}`

The simplest interpolation: inserts the corresponding value in the string.

If your string contains `"The value is: {{some_name}}"`, calling `t(category, key, { values: { some_name: "something" } })` will produce `"The value is: something"`.

### Nested translation `{{$t category key [lang]}}`

Used when you need to insert the value of another translation string in your result.

Let's say you have the following strings in the category "ui":

- key: "lang"
  - language "en": `"English"`
  - language "fr": `"Français"`
- key: "other_lang":
  - language "en": `"The other language is called {{$t ui lang fr}}"`

Now calling `t("ui", "other_lang")` will return `"The other language is called Français"`. If we left out the language tag then the current language will be used, English in this case, and the returned string would be `"The other language is called English"`.

The options are passed down to the nested call to `translate()`.

### Conditional insertion `{{$if name true_value [$else false_value]}}`

Sometimes you need to show or hide some text conditionally. The `$else` value is optional, an empty string will be inserted if it is left out.

If your string contains `"The answer is {{$if condition correct $else wrong}}"`, calling `t(category, key, { values: { condition: true } })` will produce `"The answer is correct"`; and `"The answer is wrong"` when we give it `{ condition: false }`.

### Pattern matching `{{$match name [...patterns]}}`

Pattern matching is useful for plural or gender rules. It will match the given value with one of the patterns or the default pattern if no other match.

Each pattern is composed of a value to be matched, a colon `:` and the value to insert. An underscore `_` denotes the default value to use if no other pattern matches. It is not required but strongly encouraged. All values are converted to strings before matching.

If your string contains `"I have {{$match n 0:no 1:one _:lots of}} sheep"`, calling `t(category, key, { values: { n } })` will produce:

- `n = 0` -> `"I have no sheep"`
- `n = 1` -> `"I have one sheep"`
- `n = 2` -> `"I have lots of sheep"`

## The editor {#editor}

The editor is `svelte-i18n`'s super power. We don't have an opinion on how to trigger showing the editor, all you have to do is call `showEditor()` on your `SvelteI18N` instance; and then call `hideEditor()` when you're done.

Once the editor is open, all you have to do is click on the string you want to edit and a dialog will open, allowing you to make any changes you want. If you cannot click on the text itself, there is a "see all" button in a corner of the screen that will list all the keys used on the page.

This is possible because of Svelte's [{@html ...} tag](https://svelte.dev/docs/svelte/@html). In standard use we insert your translation strings as-is (because regular text is valid HTML). When we open the editor we wrap those strings in a `<div>` with `display: contents` applied to it. In most cases this div should be invisible and have no impact on the layout of your page but now we can detect click on it and use that to show you a popup with full context to edit the translation.

## API {#api}

### class `SvelteI18N` from `@terrygonguet/svelte-i18n`

#### `constructor(options: SvelteI18NConstructorOptions)`

- `options.lang: string` - the language in which to diplay your app to the user
- `options.supportedlangs: string[]` - a list of all the languages supported by your app
- `options.fallbackLang: string` - the language to use if a translation isn't available in the current language or if we tried to use an unsupported language
- `options.preload: string[]` - a list of categories to start loading immediately. Does not block the constructor (ie: the tranlations will not be synchronously available)
- `options.fetch: typeof fetch` - a fetch function for your environment. Typically supplied by SvelteKit in the `layout.ts` or `layout.server.ts` `load` functions

#### `lang: string`

Read only identifier for the current language.

#### `supportedLangs: string[]`

Read only identifiers for the supported languages.

#### `fallbackLang: string[]`

Read only identifier for the fallback language.

#### `loadedCategories: Iterator<string>`

Read only iterator listing the loaded categories.

#### `isEditorShown: boolean`

Read only boolean indicating whether the editor is displayed or not.

#### `load(category: string, options): Promise<void>`

Loads the specified category. Returns a promise that is fulfilled when the category has been loaded, may be immediately.

- `options.lang: string` - the language in which to load the category. Defaults to the current language
- `options.skipIfCached: boolean` - skip loading data from the server if it has been loaded before

#### `loadAll(options): Promise<void>`

Loads multiple categories (all if not specified) in multiple languages (all if not specified). Returns a promise that is fulfilled when the category has been loaded.

- `options.categories: string[]` - the list of categories to load. All if not specified
- `options.langs: string[]` - the list of languages in which to load the categories. All supported if not specified

#### `setlang(lang: string): Promise<void>`

Change the display language, loading all the currently loaded categories in that new language. Returns a promise that is fulfilled when the new data is loaded.

#### `translate(category: string, key: string, options: TOptions): string`

Aliased as `t()`.

Gets and interpolate a translation string.

- `category: string` - the category to use
- `key: string` - the key to use
- `options.values: Record<string, TValue>` - the values to use when interpolating
- `options.autoload: boolean` - whether to load the category if missing. Defaults to `true`
- `options.lang: string` - the language to use to render and load the string. Defaults to the current language
- `options.overrideMissing: string` - the string to use if the data is missing
- `options.editor` - the editor config to use for this string. Use `true` for defaults, `false` to disable and an object for specific config

#### `content(content: string, options: Object): string`

Aliased as `c()`.

Inserts some external HTML **without any sanitizing**. This function does nothing to the `content` but makes `svelte-i18n` aware of it, so we can show you something when the editor is open.

- `content: string` - the raw HTML content to insert
- `options.url: string` - an optional url to where the content can be edited
- `options.editor` - the editor config to use for this content. Use `true` for defaults, `false` to disable and an object for specific config

#### `raw(category: string, key: string, options): string | undefined`

Returns the raw, saved value for this category/key and `undefined` in unavailable.

- `category: string` - the category to use
- `key: string` - the key to use
- `options.autoload` - whether to load the category if missing. Defaults to `false`
- `options.lang` - the language to use to render and load the string. Defaults to the current language

#### `rawCategory(category: string, options): Record<string, string>`

Returns the loaded data for a category.

- `category: string` - the category to get data for
- `options.autoload: boolean` - whether to load the category if missing. Defaults to `false`
- `options.lang: string` - the language to use. Defaults to the current language
- `options.includeFallback` - whether to merge the data from the fallback language into the returned value (if available). Defaults to `false`

#### `interpolate(text: string, values: Object, options: Object): string`

Interpolates patterns in `text` with the supplied `values`. See the section on [Interpolation](#interpolation) for details.

- `text: string` - the string to interpolate
- `values: Object` - the values to use when interpolating
- `options: Object` - the options to pass to the `translate()` function when using the `$t` interpolation

#### `showEditor(options: Object)`

Loads and mounts the editor component. See the section on [the editor](#editor) for details.

- `options.autoload: boolean` - set to `true` to automatically load all categories for all languages. Defaults to `false`

#### `hideEditor()`

Hides and unmounts the editor component.

### `createSvelteI18NHandle` from `@terrygonguet/svelte-i18n/server`

Helper function to create a single handler that behaves like registering multiple API endpoints. The function takes an object of hooks that will be called to interact with your system.

#### `fetchCategory(args): { [key: string]: string }`

Hook that will be called when a user wants to load a specific category in a language. Can be async.

- `args.where: { lang: string, category: string }`
- `args.event: RequestEvent` - SvelteKit's [RequestEvent](https://svelte.dev/docs/kit/@sveltejs-kit#RequestEvent)

#### `fetchAll(args): { [key: string]: string }`

Hook that will be called when a user wants to load a multiple categories and/or in multiple languages. Can be async.

- `args.where: { lang: string[], category: string[] }` - either `lang` or `category` can be omited to signify "all"
- `args.event: RequestEvent` - SvelteKit's [RequestEvent](https://svelte.dev/docs/kit/@sveltejs-kit#RequestEvent)

#### `update(args, options): void`

Hook that will be called when a user wants to save translation strings. Can be async.

- `args.data: { category: string; key: string; langs: { [lang: string]: string } }` - the payload to save
- `options.event: RequestEvent` - SvelteKit's [RequestEvent](https://svelte.dev/docs/kit/@sveltejs-kit#RequestEvent)

#### `canFetchCategory(args): boolean`

#### `canFetchAll(args): boolean`

#### `canUpdate(args, options): boolean`

Hooks that will be called before the corresponding hooks with the same args. Needs to return whether or not to allow the request. Can be async.

Defaults to allowing all requests if omited.
