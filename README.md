# Knowledge Management System

Upload text files and images. An AI service generates searchable metadata (title, description, tags,
keywords, visible text) that is stored in MongoDB and powers one search box — "black hair" finds photos
of black hair and notes that mention it; "document" finds photos of documents and text about documents.

## How it works

1. **Upload** — files stream through `busboy` straight into MongoDB GridFS (no local disk). Each file is
   checked by extension, declared type and actual bytes. The API answers `202` right away.
2. **Analyse** — a background queue sends each file to Google Gemini (`gemini-3.8-flash`). The model
   returns concrete tags ("black cat") and broad keywords ("animal", "document"), which are validated
   and saved on the asset. Status goes `pending → processing → ready` (or `failed`).
3. **Search** — runs entirely in MongoDB: a weighted `$text` index (stemmed, tags ranked above body
   text), with an escaped-regex fallback for partial words like "docu".

## Stack

| Layer  | Choice                                                                    |
| ------ | ------------------------------------------------------------------------- |
| Server | Node 22, TypeScript, Express 5, Mongoose, MongoDB + GridFS                |
| AI     | Google Gemini behind an `AiProvider` interface, plus an offline fake provider |
| Client | React 19, Vite, TypeScript, Tailwind CSS                                  |
| Tests  | Vitest unit tests (server and client)                                     |
| Deploy | One Docker image serving API + client, MongoDB Atlas                      |

## Run locally

Requires Node 22.12+ and Docker.

```powershell
docker run -d --name kms-mongo -p 27017:27017 mongo:7

cd server
Copy-Item .env.example .env   # set GEMINI_API_KEY, or AI_PROVIDER=fake to run offline
npm install; npm run dev      # http://localhost:3000

cd ../client
npm install; npm run dev      # http://localhost:5173
```

## Run with Docker

```powershell
docker build -t kms .
docker network create kms-net
docker network connect kms-net kms-mongo
docker run --rm -p 3000:3000 --network kms-net --env-file server/.env `
  -e MONGODB_URI="mongodb://kms-mongo:27017/kms" kms
```

Open <http://localhost:3000>.

## Tests

```powershell
cd server; npm run typecheck; npm run lint; npm test
cd ../client; npm run typecheck; npm run lint; npm test
```

## Configuration

Set in `server/.env` (see `server/.env.example`). Invalid config stops the server at startup with a list
of every problem.

| Variable         | Default            | Notes                              |
| ---------------- | ------------------ | ---------------------------------- |
| `MONGODB_URI`    | — (required)       | Local MongoDB or Atlas             |
| `AI_PROVIDER`    | `gemini`           | `gemini` \| `fake`                 |
| `GEMINI_API_KEY` | —                  | Required when `AI_PROVIDER=gemini` |
| `AI_MODEL`       | `gemini-3.8-flash` |                                    |
| `AI_CONCURRENCY` | `2`                | Files analysed at once             |
| `MAX_UPLOAD_MB`  | `10`               |                                    |
| `PORT`           | `3000`             |                                    |

## API

| Method | Path                      | Description                               |
| ------ | ------------------------- | ----------------------------------------- |
| POST   | `/api/assets`             | Upload 1–10 files (`files` field) → `202` |
| GET    | `/api/assets`             | Paged list, `?kind=image\|text`           |
| GET    | `/api/assets/:id`         | One asset                                 |
| GET    | `/api/assets/:id/content` | Original file                             |
| DELETE | `/api/assets/:id`         | Remove asset and file                     |
| GET    | `/api/search?q=`          | Smart search                              |
| GET    | `/api/health`             | Liveness + DB status                      |

## AI tools used

- **Cursor (AI agent mode)** — my main development assistant. I used it to plan the architecture and
  milestones, scaffold the server and client, write the Vitest unit tests, debug (for example, the Gemini
  response parser and a Docker env override that hid the UI), and click through the UI in the built-in
  browser. I reviewed every change and kept the decisions and their reasons in `agent_mds/STATUS.md`.
- **Google Gemini (`gemini-3.8-flash`)** — the runtime AI in the product itself. It analyses each
  uploaded image or text file and returns the metadata that search runs on.
