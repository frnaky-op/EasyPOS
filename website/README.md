# Site EasyPOS

Le site public utilise Next.js avec l'App Router et une exportation statique. Le contenu de la page d'accueil et du guide reste dans `index.html` et `guide.html` ; les routes Next.js les intègrent au build. Les images et les feuilles de style sont dans `public/`.

```sh
cd website
npm ci
npm run dev
```

Pour reproduire le build GitHub Pages :

```sh
NEXT_PUBLIC_BASE_PATH=/EasyPOS npm run build
```

Le résultat est créé dans `out/`. Le workflow `.github/workflows/website.yml` publie ce dossier après un push sur `main`.
