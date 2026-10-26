# Les Loups de Vaucombe

Jeu de Loup-Garou multijoueur en ligne, de 6 à 16 joueurs.
Technologies : React, TypeScript, Vite, Supabase (à venir) et Netlify.

## Où en est le projet ?

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Écrans et design (données fictives, aucun serveur) | ✅ |
| 2 | Partie locale simulée contre des robots | ✅ |
| 3 | Moteur de jeu (machine à états) + tests | ✅ |
| 4 | Base de données Supabase, rôles secrets protégés | ✅ (à installer, voir ci-dessous) |
| 5 | Salles en temps réel, reconnexion, chronos serveur | ✅ (fichier SQL n° 3 à installer) |
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

## Installer la base de données Supabase (une seule fois)

Tout se fait dans le navigateur, sur [supabase.com/dashboard](https://supabase.com/dashboard),
dans le projet `fjpqtxtlhffjubyqogos`.

1. **Activer la connexion anonyme** : menu **Authentication** → **Sign In / Providers** →
   activez **Allow anonymous sign-ins**, puis **Save**. Les joueurs n'ont ainsi besoin que
   d'un pseudo, sans e-mail ni mot de passe.
2. **Créer les tables** : menu **SQL Editor** → **New query**. Ouvrez sur GitHub le fichier
   [`supabase/migrations/20261027000001_schema.sql`](supabase/migrations/20261027000001_schema.sql),
   cliquez sur l'icône « Copy raw file », collez dans l'éditeur, puis **Run**. Le message
   « Success. No rows returned » doit s'afficher.
3. **Installer les règles du jeu** : nouvelle requête, et même chose avec
   [`supabase/migrations/20261027000002_jeu.sql`](supabase/migrations/20261027000002_jeu.sql).
   Respectez l'ordre : fichier 1, puis fichier 2, une seule fois chacun.
4. **Vérifier** : ouvrez le jeu (adresse Netlify), écran **Profil & statistiques** →
   **Vérifier la connexion**. Les trois lignes doivent passer au vert ✓.

L'adresse du projet et la clé publique « anon » sont déjà dans le code (`src/lib/supabase.ts`) :
elles sont publiques par nature, ce sont les règles de sécurité de la base qui protègent les
données. Il n'y a donc pas de variable à saisir dans Netlify (vous pouvez néanmoins les
remplacer par `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`).

⚠️ Ne mettez jamais la clé `service_role` dans Netlify ni dans le code : elle donne tous les
droits sur la base de données.

### Comment la base protège la partie

- Le navigateur ne peut **rien écrire directement** : chaque action (voter, choisir une victime,
  envoyer un message…) passe par une fonction du serveur qui vérifie les règles, exactement
  comme le moteur du jeu. Le serveur est la source de vérité.
- Les **rôles sont secrets** : chacun ne voit que le sien, les loups voient les autres loups ; le
  rôle d'un mort est révélé à tous. Le chat de la meute n'est lisible que par les loups.
- La cible des loups, les potions et le couple d'amoureux sont dans une table illisible depuis
  le navigateur ; seules les personnes concernées reçoivent l'information (la sorcière apprend
  la victime pendant son tour, chaque amoureux apprend le nom de l'autre).

### Étape 5 : temps réel et chrono serveur

Dans **SQL Editor** → **New query**, exécutez une seule fois
[`supabase/migrations/20261028000003_temps_reel.sql`](supabase/migrations/20261028000003_temps_reel.sql)
(après les fichiers 1 et 2). Il ajoute :

- la **présence** (qui est en ligne) et le **transfert automatique de l'hôte** s'il se déconnecte ;
- le **temps réel** : chaque navigateur est prévenu dès qu'un joueur agit ;
- le **chrono tenu par le serveur** : une tâche `pg_cron` fait avancer les parties toutes les
  5 secondes, même si tous les téléphones sont en veille. Si Supabase refuse d'activer `pg_cron`,
  un message l'indique et les navigateurs font avancer les chronos eux-mêmes (activable ensuite
  dans **Database → Extensions → pg_cron**, puis en exécutant à nouveau la ligne
  `select cron.schedule('loups-garous-chrono', '5 seconds', 'select public._tick_all()');`).

## Jouer en ligne

1. Une personne choisit un pseudo puis **Créer une partie** : elle devient l'hôte.
2. Elle partage le **code** ou le **lien** (bouton « Copier le lien »). Les autres l'ouvrent sur
   leur téléphone, choisissent un pseudo et entrent dans le village.
3. L'hôte règle le nombre de joueurs (il doit correspondre aux présents), les rôles et le mode
   de discussion, puis **Lancer la partie**.
4. Si quelqu'un recharge sa page ou perd la connexion, il retrouve la partie en rouvrant le jeu.

## Pour les développeurs

```bash
npm install
npm run dev     # serveur local
npm run build   # vérification TypeScript + build de production dans dist/
npm test        # tests du moteur (900 parties simulées) et du serveur SQL (PGlite)
```

Organisation :

- `src/game` : moteur de jeu en TypeScript pur, organisé en machine à états
  (`engine.ts`, expliqué dans [docs/machine-a-etats.md](docs/machine-a-etats.md)), décisions
  des robots (`bots.ts`), phrases du chat (`lines.ts`), `useLocalGame.ts` qui fait avancer le
  temps, et les tests dans `__tests__/` ;
- `src/screens` : un fichier par écran ;
- `src/components` : logo, portraits SVG des rôles, chat… ;
- `src/lib` : types, connexion Supabase, effets sonores Web Audio, statistiques locales, données
  du salon de démonstration ;
- `supabase/migrations` : tables, règles d'accès (RLS) et fonctions du jeu côté serveur ;
- `supabase/tests` : tests du serveur sur un vrai PostgreSQL embarqué (PGlite), avec plusieurs
  joueurs simulés chacun connecté sous sa propre identité ;
- `src/online` : appels au serveur, synchronisation (Realtime + relecture de secours) ;
- `e2e` : test de bout en bout avec plusieurs navigateurs. `e2e/faux-supabase.mjs` imite
  Supabase (connexion anonyme, fonctions, chrono) au-dessus de PGlite :

  ```bash
  node e2e/faux-supabase.mjs &                       # faux serveur sur le port 54321
  VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=faux npx vite build --outDir dist-e2e
  npx vite preview --outDir dist-e2e --port 4174 &
  node e2e/partie-en-ligne.mjs http://localhost:4174 8   # 8 navigateurs indépendants
  ```
