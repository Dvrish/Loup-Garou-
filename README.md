# Les Loups de Vaucombe

Jeu de Loup-Garou multijoueur en ligne, de 6 à 16 joueurs.
Technologies : React, TypeScript, Vite, Supabase (à venir) et Netlify.

## Où en est le projet ?

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Écrans et design (données fictives, aucun serveur) | ✅ |
| 2 | Partie locale simulée contre des robots | à venir |
| 3 | Moteur de jeu (machine à états) + tests | à venir |
| 4 | Base de données Supabase, rôles secrets protégés | à venir |
| 5 | Salles en temps réel, reconnexion, chronos serveur | à venir |
| 6 | Tests avec plusieurs joueurs réels | à venir |
| 7 | Mise en ligne définitive sur Netlify | à venir |

À l'étape 1, tout est **factice** : les joueurs, les rôles et les votes sont simulés pour
montrer les écrans. Le bandeau « Démo » de la table de jeu permet de passer d'une phase à l'autre.

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
```

Organisation : `src/screens` (un fichier par écran), `src/components` (logo, portraits SVG des
rôles, chat…), `src/lib` (types, données fictives, effets sonores Web Audio).
