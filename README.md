# Les Loups de Vaucombe

Jeu de Loup-Garou multijoueur en ligne, de 6 à 16 joueurs.
Technologies : React, TypeScript, Vite, Supabase (à venir) et Netlify.

## Où en est le projet ?

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Écrans et design (données fictives, aucun serveur) | ✅ |
| 2 | Partie locale simulée contre des robots | ✅ |
| 3 | Moteur de jeu (machine à états) + tests | ✅ |
| 4 | Base de données Supabase, rôles secrets protégés | à venir |
| 5 | Salles en temps réel, reconnexion, chronos serveur | à venir |
| 6 | Tests avec plusieurs joueurs réels | à venir |
| 7 | Mise en ligne définitive sur Netlify | à venir |

Depuis l'étape 2, le bouton **Jouer** lance une vraie partie d'entraînement contre des robots :
les rôles sont tirés au sort, chaque robot agit la nuit, parle dans le chat et vote le jour.
« Créer une partie » et « Rejoindre » montrent déjà le salon en ligne, mais tant que le
multijoueur n'existe pas (étape 5), les autres places y sont aussi tenues par des robots.

## Règles appliquées

- **Nuit** : Cupidon (première nuit seulement) unit deux amoureux, la Voyante découvre un rôle,
  les Loups-garous choisissent une victime, puis la Sorcière peut la sauver (potion de vie) et/ou
  empoisonner quelqu'un (potion de mort). Chaque potion ne sert qu'une fois.
- **Aube** : les morts sont annoncés et leur rôle est révélé.
- **Chasseur** : quand il meurt, il tire sur un joueur de son choix.
- **Amoureux** : si l'un meurt, l'autre meurt de chagrin. Un couple loup + villageois gagne
  s'il reste seul en vie.
- **Jour** : débat, puis vote. En cas d'égalité, l'hôte choisit la règle : personne n'est
  éliminé, tirage au sort, ou second vote entre les ex æquo.
- **Victoire** : le village gagne quand tous les loups sont morts ; les loups gagnent dès qu'ils
  sont au moins aussi nombreux que les autres joueurs vivants.

## Voir le jeu en ligne avec Netlify (sans rien installer)

1. Allez sur [app.netlify.com](https://app.netlify.com) et connectez-vous avec votre compte GitHub.
2. Cliquez sur **Add new site** → **Import an existing project**.
3. Choisissez **GitHub**, autorisez Netlify si on vous le demande, puis sélectionnez le dépôt
   **Loup-Garou-**.
4. Netlify lit automatiquement le fichier `netlify.toml` : la commande de build
   (`npm run build`) et le dossier à publier (`dist`) sont déjà remplis. Ne changez rien.
5. Cliquez sur **Deploy**. Après une ou deux minutes, Netlify affiche une adresse du type
   `https://nom-au-hasard.netlify.app` : c'est votre jeu.
6. Pour chaque *pull request* ouverte sur GitHub, Netlify crée aussi une **adresse de
   prévisualisation** (*Deploy Preview*), visible directement dans la pull request.
   Vous pouvez ainsi tester une étape avant de la valider.

### Variables d'environnement (à partir de l'étape 4)

Le fichier `.env.example` liste les variables nécessaires. Elles se saisissent dans Netlify :
**Site configuration → Environment variables**.

- `VITE_SUPABASE_URL` : l'adresse de votre projet Supabase ;
- `VITE_SUPABASE_ANON_KEY` : la clé **publique** « anon ».

⚠️ Ne mettez jamais la clé `service_role` dans Netlify ni dans le code : elle donne tous les
droits sur la base de données.

## Pour les développeurs

```bash
npm install
npm run dev     # serveur local
npm run build   # vérification TypeScript + build de production dans dist/
npm test        # tests du moteur : règles, refus d'actions, 900 parties simulées
```

Organisation :

- `src/game` : moteur de jeu en TypeScript pur, organisé en machine à états
  (`engine.ts`, expliqué dans [docs/machine-a-etats.md](docs/machine-a-etats.md)), décisions
  des robots (`bots.ts`), phrases du chat (`lines.ts`), `useLocalGame.ts` qui fait avancer le
  temps, et les tests dans `__tests__/` ;
- `src/screens` : un fichier par écran ;
- `src/components` : logo, portraits SVG des rôles, chat… ;
- `src/lib` : types, effets sonores Web Audio, statistiques locales, données du salon de démonstration.
