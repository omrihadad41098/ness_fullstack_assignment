# Knowledge Management System

Upload text files and images, have an AI service generate searchable metadata (description, tags,
keywords, visible text, broad category terms), store it in MongoDB, and search across everything from
one box — so "black hair" finds both photos with black hair and text files mentioning it.

> **Work in progress.** Done so far: M0 (scaffolding), M1 (upload & view API), M2 (AI metadata),
> M3 (smart search), M4 (library UI) and M5 (container). The app is feature-complete locally and in a
> container. Still to come: online deployment (M6) and the final README, including "AI tools used"
> (M7). See `agent_mds/STATUS.md` for the milestone board.

## How it works

1. **Upload** — files stream through `busboy` straight into MongoDB GridFS. Nothing is buffered in
   memory or written to local disk, and the response is `202` because the bytes are safe but the
   metadata is not ready yet.
2. **Analyse** — a background queue sends each asset to the AI provider: images as inline base64,
   text files as their opening characters. The model returns a description, concrete tags
   ("black hair"), and broad category keywords ("document", "person"), which are validated and
   stored on the asset document. The asset moves `pending → processing → ready` (or `failed`).
3. **Search** — one query hits MongoDB's weighted text index, which stems English and ranks tag hits
   above matches buried in extracted text. If it finds nothing, an escaped-regex query catches
   partial words like "docu". Both run entirely in the database.

Because the AI writes *category* words as well as literal ones, "document" finds a photo of a
receipt and a text file that mentions documents, and "black hair" finds both a portrait and a note
about one.

## API

| Method | Path                        | Notes                                                          |
| ------ | --------------------------- | -------------------------------------------------------------- |
| GET    | `/api/health`               | `{ status, db, aiProvider }`                                    |
| POST   | `/api/assets`               | `multipart/form-data`, field `files` (1–10) → `202 { assets }`   |
| GET    | `/api/assets`               | `?page=&limit=&kind=image\|text` → paged list                   |
| GET    | `/api/assets/:id`           | One asset                                                       |
| GET    | `/api/assets/:id/content`   | Streams the original bytes from GridFS                          |
| POST   | `/api/assets/:id/reprocess` | `202`; re-queues the asset for analysis                         |
| DELETE | `/api/assets/:id`           | `204`; removes the document and its GridFS file                 |
| GET    | `/api/search`               | `?q=&kind=&page=&limit=` → `{ query, results, total }`          |

Uploads accept `.txt`, `.md`, `.csv`, `.json`, `.png`, `.jpg/.jpeg`, `.webp` and `.gif` up to
`MAX_UPLOAD_MB` (10 by default). A file has to pass three checks, not one: its extension, its declared
content type, and its actual bytes — images against their magic-byte signature, text against strict
UTF-8 decoding. So a text file renamed to `.png` is rejected with `415`, not stored. Validation runs
while the bytes stream into GridFS, so nothing is buffered in memory or written to local disk.

## Stack

| Layer  | Choice                                                                    |
| ------ | ------------------------------------------------------------------------- |
| Server | Node 22, TypeScript, Express 5, Mongoose (MongoDB + GridFS for file bytes) |
| AI     | Google Gemini (`gemini-3.8-flash`) behind an `AiProvider` interface, plus a deterministic fake provider for offline runs |
| Client | React 19, Vite, TypeScript, Tailwind CSS, React Router                    |
| Tests  | Vitest unit tests in both packages; Postman collection for the API        |
| Deploy | One Docker image (Express serves the API and the built client) + MongoDB Atlas |

## Run locally

Prerequisites: Node 22.12+ and a MongoDB instance.

```powershell
# 1. MongoDB
docker run -d --name kms-mongo -p 27017:27017 mongo:7

# 2. Server (http://localhost:3000)
cd server
Copy-Item .env.example .env   # AI_PROVIDER=fake runs without any API key
npm install
npm run dev

# 3. Client (http://localhost:5173, proxies /api to the server)
cd ../client
npm install
npm run dev
```

`GET http://localhost:3000/api/health` should return `{ "status": "ok", "db": "up", "aiProvider": "fake" }`.

## Tests

```powershell
cd server; npm run typecheck; npm run lint; npm test
cd ../client; npm run typecheck; npm run lint; npm test
```

## API testing (Postman)

Import `postman/kms.postman_collection.json` with `postman/local.postman_environment.json`, or run it
headless:

```powershell
npx newman run postman/kms.postman_collection.json -e postman/local.postman_environment.json --working-dir .
```

Run it from the repository root: upload requests attach files from `samples/` by relative path.
98 assertions over 35 requests cover health, the asset lifecycle, search (stemming, the partial-word
fallback, regex escaping, the `kind` filter) and every error code. Each folder deletes what it
uploads, so the collection can be run repeatedly.

## Docker

One multi-stage image builds the client, compiles the server, and ships a runtime layer that serves both
from the same origin. It holds no state — every byte lives in MongoDB — so it runs on any container host.

```powershell
docker build -t kms .

# Put the app and MongoDB on one network and address Mongo by container name.
docker network create kms-net
docker network connect kms-net kms-mongo
docker run --rm -p 3000:3000 --network kms-net `
  -e MONGODB_URI="mongodb://kms-mongo:27017/kms" `
  -e AI_PROVIDER=fake `
  kms
```

`host.docker.internal:27017` also works, but only if nothing else on the host is listening on that
port — a locally installed MongoDB service will silently win, and the container will quietly use the
wrong database. The container network avoids the ambiguity.

Then open <http://localhost:3000> for the UI and <http://localhost:3000/api/health> for the API.

- Runs as the non-root `node` user; `HEALTHCHECK` polls `/api/health` and reports unhealthy while
  MongoDB is unreachable.
- Startup fails fast: a missing `MONGODB_URI` or provider API key exits with code 1 and logs every
  problem at once.
- `CLIENT_DIST_DIR` is baked in as `/app/client/dist`; override it only if you relocate the build.

## Configuration

All server configuration is read from the environment and validated at startup (the process exits with
a list of every problem). See `server/.env.example` for the full list and defaults.

| Variable                            | Default                         | Notes                                        |
| ----------------------------------- | ------------------------------- | -------------------------------------------- |
| `PORT`                              | `3000`                          |                                              |
| `MONGODB_URI`                       | — (required)                    | Local instance or MongoDB Atlas              |
| `AI_PROVIDER`                       | `gemini`                        | `gemini` \| `fake`                           |
| `GEMINI_API_KEY`                    | —                               | Required when `AI_PROVIDER=gemini`           |
| `AI_MODEL`                          | `gemini-3.8-flash`              | Override the provider's default model        |
| `AI_CONCURRENCY`                    | `2`                             | Assets analysed at once                      |
| `MAX_UPLOAD_MB`                     | `10`                            |                                              |
| `LOG_LEVEL`                         | `info`                          | `debug` \| `info` \| `warn` \| `error`       |
| `CLIENT_DIST_DIR`                   | `../client/dist`                | Built client served by Express in production |

Only providers that are actually implemented are accepted. Adding a vendor is one new file
implementing `AiProvider` plus one branch in `createAiProvider` — nothing else changes.

## AI tools used

Documented in M7.
