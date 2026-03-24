# Svelte-i18n

## Quoi

`svelte-i18n` est une librairie pour [SvelteKit](https://svelte.dev/docs/kit) créée pour vous aider à traduire et localiser votre application.

Contrairement à la plupart des librairies d'i18n, `svelte-i18n` stocke les textes de traduction dans une base de données (ou autre type de stockage) au lieu de votre code source. Tout ce que vous avez à faire est d'écrire le code pour accéder et changer ces données.

L'avantage principal de faire les choses de cette façon est qu'il est maintenant possible d'afficher un éditeur visuel directement dans la page, donnant le pouvoir à tout le monde dans votre équipe de modifier les textes, pas seulement les développeurs. Et en bonus vous pouvez stocker les traductions dans le CMS de votre choix, avec le reste de votre contenu.

## Pourquoi

Je voulais une librairie d'internationalisation simple et qui utilise tous les avantages de Svelte et SvelteKit, en me laissant faire ce que je veux avec mes données.

## Comment

La combinaison du tag [`{@html ...}` de Svelte](https://svelte.dev/docs/svelte/@html) et sa [réactivité](https://svelte.dev/docs/svelte/svelte-reactivity#createSubscriber) est le secret de `svelte-i18n`. Cela nous permet de faire le chargement automatique facilement. Une fois l'éditeur activé, chaque bout de texte est entouré d'un élément HTML invisible qui nous permet de transmettre le contexte à l'éditeur.

Si tout ça vous intéresse vous pouvez [commencer ici](/docs).
