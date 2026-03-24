# Svelte-i18n

## What

`svetle-i18n` is a [SvelteKit](https://svelte.dev/docs/kit) library to help you translate and localize your app.

`svetle-i18n` allows you to store translation strings in a database (or storage of some kind) or your source code. All you have to provide is the code to get and optionally update that data.

The main advantage of doing it that way is that we are free to display an in-page editor so that anyone in your team can make changes, not just developers. And as a bonus you can store your translations strings in your CMS of choice, next to the rest of your content.

## Why

I wanted a simple i18n library that takes full advantage of Svelte and SvelteKit, while letting me do whatever I want with my data.

## How

The special sauce for `svetle-i18n` are [Svelte's `{@html ...}` tag](https://svelte.dev/docs/svelte/@html) and [reactivity](https://svelte.dev/docs/svelte/svelte-reactivity#createSubscriber). First off they allow us first to do easy auto loading of strings. Then, once you activate the editor, every string is wrapped in an invisible HTML element that allows a rich editor UI.

If you're interested, you can [get started here](/docs)!
