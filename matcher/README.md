# Rocksky Matcher

Moteur de matching musical en OCaml, basé sur la politique de
[`../crates/matching`](../crates/matching). Il valide l’identité d’un morceau
avant de classer les résultats et explique les refus. Le cœur fonctionne sans
réseau ; le service récupère des candidats depuis le catalogue Rocksky,
Spotify et les services Rocksky Deezer/MusicBrainz.

## Démarrage rapide

Prérequis : OCaml ≥ 5.2, OPAM, Dune ≥ 3.24, bibliothèques système SQLite et
libpq. Sur macOS avec libpq installé par Homebrew, son répertoire pkg-config
peut être nécessaire :

```sh
export PKG_CONFIG_PATH="/opt/homebrew/opt/libpq/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
opam install . --deps-only --with-test
opam exec -- dune build @all
opam exec -- dune runtest
```

Les tests HTTP/Redis ouvrent uniquement des ports temporaires sur loopback.
Ils n’utilisent ni comptes fournisseurs ni bases de production.

Essayer le moteur hors ligne :

```sh
opam exec -- dune exec matcher -- resolve examples/beat-it.json
opam exec -- dune exec matcher -- normalize 'Björk — Live'
```

Le premier exemple sélectionne `original` et explique pourquoi `remaster` est
rejeté. `resolve -` lit le même format JSON depuis l’entrée standard :
`{"request": {...}, "candidates": [...]}`. La limite CLI est de 16 MiB.

Démarrer avec les services Rocksky existants :

```sh
DEEZER_URL=http://127.0.0.1:8090 \
MUSICBRAINZ_URL=http://127.0.0.1:8088 \
opam exec -- dune exec matcher -- serve
```

Au moins un fournisseur est requis. Aucun fichier `.env` n’est chargé
implicitement. Le binaire écoute par défaut sur `127.0.0.1:8097` ; `SIGINT`
et `SIGTERM` arrêtent le serveur. Pour tester à côté du service Rust, choisir
un autre port, par exemple `MATCHING_BIND=127.0.0.1:8098`.

## API

```sh
curl http://127.0.0.1:8097/v1/match \
  -H 'Content-Type: application/json' \
  --data '{"title":"Beat It","artists":["Michael Jackson"],"album":"Thriller"}'
```

`GET /health` vérifie que le processus répond ; il ne vérifie pas les fournisseurs.
`POST /v1/match` accepte :

- `title`, `artists` : requis, textes Unicode, maximum 1024 octets par champ,
  de 1 à 32 artistes ;
- `album`, `albumArtist` : facultatifs ; une valeur vide fournie est invalide ;
- `durationMs` : entier positif jusqu’à `Int64.max_int` ;
- `identifiers` : objet facultatif avec `musicbrainzRecordingId`,
  `musicbrainzReleaseId`, `isrc`, `spotifyTrackId`, `deezerTrackId`.

Les champs inconnus et les clés dupliquées sont refusés. Les identifiants
acceptent 1 à 128 caractères ASCII alphanumériques ou tirets. Une valeur
absente reste inconnue ; elle n’est jamais inventée.

La réponse contient `policyVersion`, `status`, `track`, `candidates`,
`rejected` et `warnings`. `track` est non nul uniquement pour `matched`.
`ambiguous` signifie que les preuves ne permettent pas de choisir ;
`unmatched` signifie qu’aucun candidat n’a passé les filtres.

Chaque candidat retenu expose `reasons` et un `rank` lexicographique :
identifiants vérifiés, durée compatible, préférence d’album, statut de
publication, pays préféré (XW/US). **Ce rang n’est pas une probabilité.**
Les scores de recherche des fournisseurs sont seulement informatifs.

| Code HTTP | Signification |
| --- | --- |
| 200 | Résultat matched, ambiguous ou unmatched |
| 400 | JSON ou requête invalide |
| 408 | Lecture du corps trop lente |
| 413 | Corps supérieur à 16 KiB, y compris en transfert chunked |
| 415 | Content-Type différent de application/json |
| 429 | 32 recherches simultanées déjà en cours |
| 503 | Récupération incomplète sans candidat utilisable |

Un fournisseur sain peut fournir un résultat malgré la panne d’un autre ;
`warnings` signale alors les fournisseurs indisponibles. Les erreurs de
transport ne sont jamais transformées en `unmatched`.

## Politique de décision

1. Vérifier le titre et tous les artistes demandés. Des crédits supplémentaires
   sont permis ; les correspondances par sous-chaîne sont refusées.
2. Si un album est fourni, exiger cet album, même pour une recherche par ID.
   Un album inconnu ne satisfait pas cette contrainte. Un conflit d’album artist
   connu est rejeté ; une valeur inconnue reste tolérée, comme en Rust.
3. Conserver les mots de version : live, remix, remaster, edit, etc. Examiner
   aussi l’album et les indications de version du fournisseur.
4. Un ID explicitement demandé et vérifié peut autoriser une version différente,
   mais jamais un autre titre de base, artiste ou album demandé. Un conflit
   d’identifiant rejette le candidat, même si un autre ID correspond.
5. Si les deux durées sont connues, appliquer `max(5000 ms, durée demandée / 50)`.
   Une durée fournisseur nulle est inconnue.
6. Classer les candidats compatibles et dédupliquer les copies de métadonnées.
   Pour départager des ex æquo, chaque paire doit partager un ISRC ou un MBID
   d’enregistrement sans conflit. Préférer ensuite l’album de l’artiste, puis
   la première date de publication connue.

Les sous-titres facultatifs comme `(Time of Your Life)` sont traités selon les
règles Rust ; une annotation `(Live)`, `(Club Mix)` ou `(feat. Guest)` n’est pas
un sous-titre facultatif. `Earth, Wind & Fire` reste un nom complet.

## Configuration

| Variable | Rôle |
| --- | --- |
| `MATCHING_BIND` | Adresse d’écoute, défaut `127.0.0.1:8097` |
| `DEEZER_URL` | URL du service Rocksky Deezer, pas l’API publique |
| `MUSICBRAINZ_URL` | URL du service Rocksky MusicBrainz |
| `SPOTIFY_API_URL` | Par exemple `https://api.spotify.com/v1` |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Authentification Spotify client credentials |
| `SPOTIFY_ACCESS_TOKEN` | Alternative statique si les credentials sont absents |
| `SPOTIFY_TOKEN_URL` | Défaut `https://accounts.spotify.com/api/token` |
| `XATA_READ_POSTGRES_URL` | Catalogue PostgreSQL, prioritaire sur DATABASE_URL |
| `DATABASE_URL` | Catalogue explicite PostgreSQL ou `sqlite:/chemin/catalog.db` |
| `REDIS_URL` | Cache facultatif, `redis://[:password@]host:6379[/db]` ou authentification ACL |
| `MATCHING_CACHE_NAMESPACE` | Isolation supplémentaire entre déploiements |
| `MATCHING_CACHE_TTL_SECONDS` | Succès : défaut 86400, maximum 604800, 0 désactive ces écritures |
| `MATCHING_CACHE_NEGATIVE_TTL_SECONDS` | Ambigu/non trouvé : défaut 300, maximum 3600 |

Les recherches fournisseurs démarrent concurremment et disposent chacune de
8 secondes. Chaque appel HTTP est limité à 7 secondes et 2 MiB de réponse.
Le service limite chaque fournisseur à 2000 candidats. L’enrichissement
Spotify du résultat sélectionné dispose d’une seconde supplémentaire et ne
peut changer que le label, les genres et l’image de l’artiste. Les tokens sont
renouvelés avant expiration, avec un renouvellement partagé et une seule
nouvelle tentative après un 401.

Le catalogue utilise les tables `tracks`, `albums`, `album_tracks` de Rocksky.
Les connexions SQLite sont ouvertes en lecture seule, sans création ni migration.
PostgreSQL impose `default_transaction_read_only=on` et un timeout SQL de
7 secondes. Les paramètres SQL sont liés, jamais interpolés. Cinq accès
catalogue au maximum s’exécutent dans des workers ; un timeout HTTP ne libère
pas prématurément un worker encore occupé. Une recherche dépassant 500 lignes
est déclarée incomplète.

Le cache Redis utilise des clés SHA-256 comprenant toutes les contraintes,
la version de politique, les fournisseurs, la configuration et les TTL.
Chaque opération dispose de 200 ms ; une panne ou une entrée invalide déclenche
une recherche normale. Les réponses avec warnings et les erreurs ne sont pas
stockées. Les previews limitent la durée du cache à leur expiration moins
60 secondes, ou à 5 minutes si leur expiration est inconnue.
`x-matching-cache` vaut `HIT`, `MISS` ou `BYPASS`.

## Organisation du code

| Module | Responsabilité |
| --- | --- |
| `Domain` | Types de requête, candidat, rejet et décision |
| `Request` | Validation des entrées |
| `Normalize`, `Versions` | Unicode, sous-titres et versions |
| `Policy` | Filtres, preuves, rangs, déduplication et ambiguïté |
| `Json` | Contrat JSON strict et sérialisation |
| `Provider`, `Providers`, `Spotify_auth` | Fournisseurs et authentification |
| `Catalog` | Lecture SQL du catalogue |
| `Http_io`, `Service`, `Config` | Transport, limites et configuration |
| `Cache` | Cache Redis borné |
| `Client` | Client OCaml typé du endpoint matching |

La bibliothèque est disponible sous `Matcher`. Le cœur s’appelle avec
`Policy.resolve request candidates` et retourne un `result` OCaml. Un fournisseur
personnalisé se construit avec `Provider.make`; il ne décide pas du matching.
`Client.match_track ~base_url request` distingue erreur HTTP, réponse invalide,
transport indisponible et erreur de validation.

## Vérification et performance

```sh
opam exec -- dune runtest
python3 scripts/test_postgres.py
python3 scripts/test_cli.py
python3 scripts/generate_parity.py
opam exec -- dune exec bin/benchmark.exe -- 500
```

Le test PostgreSQL crée un cluster temporaire dans `/tmp`, accessible uniquement
par socket Unix, puis l’arrête et le supprime. Il nécessite `initdb`, `pg_ctl`
et `psql` sur PATH et n’utilise jamais les bases existantes.

Le générateur de parité extrait le cœur Rust existant, exécute ses 66 tests,
puis produit 409 cas déterministes avec leurs résultats de référence.
La fixture est versionnée ; les tests OCaml ordinaires ne nécessitent pas Rust.
La régénération utilise Cargo hors ligne et requiert ses dépendances en cache.

Le benchmark mesure le cas de candidats ex æquo partageant un même enregistrement.
Les preuves normalisées sont calculées une fois par candidat, puis comparées
par paires. Sur la machine de développement, 500 candidats sont passés d’environ
1101 ms à 26 ms après cette optimisation ; ce n’est pas une mesure de débit
réseau ni une garantie de latence en production. Le contrôle des paires reste
quadratique dans le nombre d’ex æquo.

## Compatibilité et limites connues

- La version de politique est `2-ocaml.1`, avec un namespace de cache distinct
  du service Rust. Le contrat JSON suit celui de Rust ; le client accepte
  également les réponses de sa politique `2`.
- La déduplication conserve les lignes portant des preuves contradictoires,
  même si leur source et leur ID sont identiques. C’est un renforcement
  intentionnel par rapport à la seconde déduplication Rust, couvert par un test.
- Les métadonnées fournisseur vides ou UTF-8 invalides sont rejetées. Les
  requêtes refusent également les clés JSON dupliquées.
- Les durées utilisent des entiers signés 64 bits positifs, au lieu des `u64`
  Rust. Les versions des tables Unicode des bibliothèques peuvent différer
  pour des caractères très récents.
- La récupération SQL utilise le titre en minuscules ou les IDs ; elle n’est
  pas une recherche Unicode ou approximative complète. Le filtre final est
  plus précis que cette présélection. Les résultats restent limités par les
  métadonnées et les candidats réellement exposés par les fournisseurs.
- SQLite n’offre ici qu’un délai d’attente de verrou de 7 secondes, pas
  d’interruption d’une requête CPU longue. Les workers restent bornés.
- Le cache ouvre une connexion par opération et supporte `redis://`, sans
  Redis Cluster ni `rediss://`. Une configuration non supportée désactive le
  cache avec un message. Les accès HTTP supportent HTTPS avec TLS.
- Aucun déploiement ni remplacement du service Rust n’est effectué par ce projet.
  Les tests fournisseurs utilisent des serveurs locaux simulés.
