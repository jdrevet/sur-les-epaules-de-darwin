# Sur les épaules de Darwin — catalogue des émissions

Petit site statique pour explorer, trier et rechercher les émissions de
*Sur les épaules de Darwin* (Jean Claude Ameisen, France Inter, septembre 2010 –
juin 2022), l'interface de radiofrance.fr n'étant pas pratique pour ça.


Site non officiel. Données extraites de [radiofrance.fr](https://www.radiofrance.fr/franceinter/podcasts/sur-les-epaules-de-darwin)
et de [Wikipédia](https://fr.wikipedia.org/wiki/Sur_les_%C3%A9paules_de_Darwin).

## Contenu

- `index.html`, `app.js`, `style.css` : le site, sans framework ni build.
  Seule dépendance : [MiniSearch](https://lucaong.github.io/minisearch/) (CDN, version figée avec SRI).
- `data/episodes.json` : les données des émissions, générées une fois (l'émission est arrêtée).

Hébergé sur GitHub Pages, dans un sous-chemin : les chemins sont relatifs.
Test local : `python3 -m http.server`, puis <http://localhost:8000>.

## Fonctionnalités

- Recherche plein texte (titre, série, sujets, teasing, intro, références), insensible
  aux accents, préfixe et tolérance aux fautes ; résultats triés par pertinence.
- Filtres : série (ou en série / hors série), année, thème radiofrance.fr, nombre minimal de rediffusions.
- Tri par colonne (clic sur l'en-tête). Clic sur un sujet : le recherche ; sur une série : la filtre.
- Clic sur une ligne : détail (lecteur MP3, lien radiofrance.fr, intro, références, diffusions).
- L'état (recherche, filtres, tri, lignes ouvertes) est dans l'URL (`#q=…&sort=rerunCount:desc`),
  donc partageable.
