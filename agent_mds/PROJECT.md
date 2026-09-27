# PROJECT — Requirements, Architecture, AI, API & Deployment

Source of truth for **what** we build and **how it is structured**. Source brief: `Home Assignment.pdf`.
If code changes a contract described here, update this file in the same change.

---

## 1. Requirements

### R1 — File upload & view

- [x] Upload text files (`.txt`, `.md`, `.csv`, `.json`) and images (`.png`, `.jpg/.jpeg`, `.webp`, `.gif`), one or many at once. _(API — M1)_
- [x] Reject unsupported types / oversized files (default 10 MB) with a clear error. _(API — M1; shown in the UI in M4)_
- [ ] Uploaded assets appear in the library with their processing status. _(API returns them; UI is M4)_
- [ ] Asset detail view shows the original content (image preview / text) plus its generated metadata. _(`/content` streams it; UI is M4)_



### R2 — AI-generated metadata

- [ ] On upload, an AI service generates **description, tags, keywords, visible text (images), broad category terms**.
- [ ] Metadata is **stored in MongoDB** and is what search runs against.
- [ ] AI failure never loses the upload: asset marked `failed` with an error; can be reprocessed.



### R3 — Smart search (DB-only)

- [ ] One search box returns mixed image + text results, ranked by relevance.
- [ ] Brief example 1: **"black hair"** → images containing black hair **and** text files that include/reference it.
- [ ] Brief example 2: **"document"** → images containing documents **and** text files that contain/reference the term.
- [ ] Optional filter by kind (image / text). Sensible empty / no-results states.
- [ ] **All searching is executed by MongoDB queries.** No in-memory ranking, no external search engine, no vector math in Node.

- [ ] README: overview, architecture, run locally, run tests, deploy, decisions & trade-offs, limitations/next steps, **AI tools used**.



### Non-goals

Authentication/authorization, multi-tenancy, scalability work, production-grade security.

### Global constraints (decided by the user — do not violate)

- **MongoDB only** for persistence (metadata **and** file bytes via GridFS). No SQLite, no local disk storage.
- **No caching anywhere**: every request is computed fresh (see §6).
- **Styling:** Tailwind CSS.
- **Testing:** Vitest only (client + server), **unit tests only**. End-to-end API behaviour is checked through the UI.

---



## 2. Stack


| Layer        | Choice                                                                | Notes                                                                      |
| ------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Server       | Node 22 LTS, TypeScript, Express 5                                    | ES modules (see D16)                                                       |
| DB           | MongoDB 7 + **Mongoose**                                              | Schemas give DB-level validation; GridFS via `mongoose.mongo.GridFSBucket` |
| File storage | **GridFS** bucket `uploads`                                           | Keeps the container stateless → any container host works                   |
| Uploads      | **busboy**                                                            | Streams multipart directly into GridFS; enforces size/file-count limits    |
| Validation   | Hand-written validators in `server/src/validation/`                   | Small pure functions, unit-tested                                          |
| Logging      | Tiny `logger.ts` wrapper over `console` emitting JSON lines           | No logging library                                                         |
| AI           | `AiProvider` interface; one real provider (see §4) + `FakeAiProvider` | Swappable via `AI_PROVIDER` env                                            |
| Client       | React 19, Vite, TypeScript, **Tailwind CSS v4**, react-router         | Data fetching via small custom hooks over `fetch`                          |
| Tests        | **Vitest** (both packages), unit only                                 | UI click-through for API behaviour                                         |
| Deploy       | One Docker image (Express serves API + built client) + MongoDB Atlas  | Host: see §8                                                               |


---



## 3. Architecture

```
Browser (React + Tailwind)
   │  fetch (cache: 'no-store')
   ▼
Express ──► routes ──► services ──► repositories (Mongoose) ──► MongoDB: assets collection
                          │                      └──────────► MongoDB: GridFS "uploads"
                          └──► processingService ──► AiProvider (real | fake)
Search: routes/search ──► searchService ──► assetRepository.search() ──► MongoDB $text query
```

**Async processing.** `POST /api/assets` streams each file into GridFS, creates an asset document with
`status: 'pending'`, triggers background processing (in-process, fire-and-forget promise with a small
concurrency limit), and returns `202`. The client polls `GET /api/assets/:id` every ~2 s while status is
`pending|processing`. On server start, assets left in `pending|processing` are re-processed.
Why: AI calls take seconds; uploads stay fast and AI failures are non-fatal.

### Server layout

```
server/src/
  index.ts                  # connect Mongo, build app, listen, startup recovery
  app.ts                    # createApp(deps) — pure wiring, no side effects
  config.ts                 # reads process.env, validates by hand, throws clear errors
  logger.ts                 # log.info/warn/error({...}, msg) → JSON line to stdout
  db/connection.ts          # mongoose.connect, GridFS bucket factory
  models/asset.model.ts     # Mongoose schema + indexes (incl. text index)
  repositories/assetRepository.ts   # ALL Mongo queries live here
  storage/gridFsStorage.ts          # upload stream, download stream, delete
  ai/aiProvider.ts          # interface + AssetMetadata type
  ai/<vendor>Provider.ts    # the real provider
  ai/fakeAiProvider.ts      # deterministic, offline
  ai/prompts.ts             # prompt text + PROMPT_VERSION
  ai/parseMetadata.ts       # validates/normalizes raw AI JSON → AssetMetadata
  services/assetService.ts  # upload, get, list, delete, reprocess
  services/processingService.ts     # run AI, save metadata, status transitions, retries
  services/searchService.ts # builds params, calls repository.search
  validation/               # fileType.ts (ext + MIME + magic bytes), query.ts (search/list params), ids.ts
  http/routes/{assets,search,health}.ts
  http/uploadParser.ts      # busboy wrapper → GridFS
  http/middleware/{requestId,noCache,errorHandler}.ts
  http/errors.ts            # AppError(code, status, message, details?)
  types/api.ts              # DTOs (mirrored in client/src/api/types.ts)
server/test/unit/…          # Vitest unit tests
```

Layering: **routes** (HTTP only) → **services** (logic) → **repositories/storage/ai** (I/O).
Routes never query Mongo; services never touch `req/res`. Dependencies injected via `createApp(deps)`
so services can be unit-tested with fakes.

### Client layout

```
client/src/
  main.tsx, App.tsx, index.css (Tailwind directives)
  api/client.ts             # fetch wrapper: cache 'no-store', parses error shape → ApiError
  api/types.ts              # mirror of server DTOs — keep in sync
  hooks/useAssets.ts, useAsset.ts (with polling), useSearch.ts (debounced), useUpload.ts
  components/UploadDropzone, SearchBar, AssetGrid, AssetCard, AssetDetail, StatusBadge, EmptyState, ErrorBanner
  pages/LibraryPage.tsx (/ — library + search), AssetPage.tsx (/assets/:id)
  lib/                      # pure helpers (formatBytes, validateFile, buildQueryString…) — unit-tested
```

Search state lives in the URL (`/?q=black+hair&kind=image`). Hooks use `useEffect` + `AbortController`
(abort stale requests on query change/unmount) and return `{ data, error, loading, refetch }`.

---



## 4. AI for metadata / search-tag generation



### Types of AI that can generate the tags


| Type                                     | Examples                                                                              | Images          | Text | Strengths                                                                                                                     | Weaknesses                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | --------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Hosted multimodal LLM**                | OpenAI GPT-4o-mini / GPT-4.1-mini, Google Gemini Flash, Anthropic Claude Haiku/Sonnet | ✅               | ✅    | One model for both file types; free-form description + tags + synonyms + categories + OCR in one call; structured JSON output | Paid per token (Gemini has a free tier); network latency; non-deterministic                                                   |
| **Dedicated vision APIs**                | Google Cloud Vision, AWS Rekognition, Azure AI Vision                                 | ✅               | ❌    | Deterministic labels, strong OCR, confidence scores                                                                           | Fixed label vocabulary, weak on attributes like "black hair"; no text-file support → needs a second service; more cloud setup |
| **Open-source multimodal (self-hosted)** | Llama 3.2 Vision, Qwen2-VL, LLaVA via Ollama                                          | ✅               | ✅    | No per-call cost, data stays local                                                                                            | Needs GPU/lots of RAM; huge container; hard to deploy on free hosts                                                           |
| **Hosted open-source inference**         | Groq, Together AI, Hugging Face Inference                                             | ✅ (some models) | ✅    | Cheap, fast                                                                                                                   | Model availability changes; quality varies                                                                                    |
| **Classic NLP (no LLM)**                 | TF-IDF / RAKE keyword extraction                                                      | ❌               | ✅    | Free, deterministic                                                                                                           | No understanding, no synonyms/categories, useless for images                                                                  |




### Choice

Use a **hosted multimodal LLM** — it's the only type that handles both images and text in one
interface and can produce the *category* and *synonym* terms the brief's examples need
(a receipt photo → "document").

**Decided (M2): Google Gemini `gemini-3.8-flash`, plus the offline `fake` provider.** Called over raw
`fetch` against the Interactions API (`POST /v1beta/interactions`) with a JSON response schema — no
vendor SDK, so the dependency surface stays small and the request is visible in the code. Only
implemented vendors are accepted by `config.ts`; offering `openai` while `createAiProvider` ignores
it would silently run the wrong model. Adding a vendor is one new file implementing `AiProvider`
plus one branch in `createAiProvider`.

### Contract

```ts
interface AssetMetadata {
  description: string;          // 1–3 sentences
  tags: string[];               // 5–15 short lowercase terms (objects, attributes, colors, people features)
  keywords: string[];           // synonyms + broad categories (e.g. "document", "person", "animal", "text")
  extractedText: string | null; // visible text in an image; null if none
}
type AiProvider = {
  readonly name: string;   // stored on the asset, so metadata is traceable to what produced it
  readonly model: string;
  readonly analyzeImage: (input: { data: Buffer; mimeType: string; fileName: string }) => Promise<AssetMetadata>;
  readonly analyzeText: (input: { text: string; fileName: string }) => Promise<AssetMetadata>;
};
```

- Prompt requires: concrete visual attributes (hair color, clothing, objects, colors, setting), multi-word
tags kept together ("black hair"), **broad category words**, synonyms, and any visible text.
- Ask for JSON output (vendor JSON mode / response schema); then `parseMetadata()` validates by hand:
correct types, lowercase + trim + dedupe tags, cap lengths. Invalid → throw → asset `failed`.
- Text files: send the first ~8 000 chars; store up to ~50 000 chars as `extractedText` so the raw text is searchable too.
- 30 s timeout; retry up to 2 times with backoff on 429/5xx only.
- Store `aiProvider`, `aiModel`, `promptVersion` on each asset for traceability.
- `FakeAiProvider`: deterministic — tags/keywords derived from filename words and text content. Used in unit tests and offline dev (`AI_PROVIDER=fake`).

---



## 5. Data model (MongoDB)



### `assets` collection (Mongoose model `Asset`)

```ts
{
  _id: ObjectId,
  originalName: string,
  mimeType: string,
  kind: 'text' | 'image',
  sizeBytes: number,
  fileId: ObjectId,                 // GridFS file id in bucket "uploads"
  status: 'pending' | 'processing' | 'ready' | 'failed',
  error: string | null,
  description: string | null,
  tags: string[],
  keywords: string[],
  extractedText: string | null,
  aiProvider: string | null, aiModel: string | null, promptVersion: string | null,
  createdAt: Date, updatedAt: Date  // mongoose timestamps
}
```



### Indexes

```js
// the ONE text index powering search (MongoDB allows one text index per collection)
{ tags: 'text', keywords: 'text', description: 'text', extractedText: 'text', originalName: 'text' }
  weights: { tags: 10, keywords: 8, description: 5, originalName: 3, extractedText: 2 }
  default_language: 'english'      // stemming: "documents" matches "document"
{ createdAt: -1 }
{ status: 1 }
```



### Search query (in `assetRepository.search`)

1. Validate `q` (trimmed, 1–200 chars) and `kind`, `limit` (default 20, max 50), `page`.
2. Primary: `find({ $text: { $search: q }, status: 'ready', ...kindFilter }, { score: { $meta: 'textScore' } })`
  sorted by `{ score: { $meta: 'textScore' } }`. Documents matching more terms / higher-weight fields rank higher,
   so "black hair" ranks assets with both words (especially in tags) first.
3. Fallback when the primary returns nothing: case-insensitive **escaped** regex on `tags`, `keywords`,
  `description`, `originalName` (handles partial words like "docu"). Still a DB query.
4. Return `{ results: [{ asset, score }], total }`. Each asset carries its tags and description so the UI can show them (keywords are search-only); ranking stays entirely MongoDB's.

- Never pass raw user input into `$regex` without escaping; `$text` input is passed as a string (no operators constructed from it).
- Scale path (mention in README, don't build): MongoDB Atlas Search / Atlas Vector Search for semantic ranking.

---



## 6. HTTP API (prefix `/api`)

**No caching:** `noCache` middleware sets `Cache-Control: no-store` on every `/api` response;
`app.set('etag', false)`; no in-memory caches or memoization of DB/AI results; client `fetch` uses
`cache: 'no-store'`. Every request hits MongoDB.


| Method | Path                        | Request                                           | Success                                                                                |
| ------ | --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/health`               | —                                                 | `200 { status: "ok", db: "up", aiProvider }`                                           |
| POST   | `/api/assets`               | `multipart/form-data`, field `files` (1–10 files) | `202 { assets: Asset[] }`                                                              |
| GET    | `/api/assets`               | `?page=1&limit=20&kind=image                      | text`                                                                                  |
| GET    | `/api/assets/:id`           | —                                                 | `200 Asset`                                                                            |
| GET    | `/api/assets/:id/content`   | —                                                 | `200` streamed bytes from GridFS, stored `Content-Type`, `Content-Disposition: inline` |
| POST   | `/api/assets/:id/reprocess` | —                                                 | `202 Asset`                                                                            |
| DELETE | `/api/assets/:id`           | —                                                 | `204` (removes document + GridFS file)                                                 |
| GET    | `/api/search`               | `?q=...&kind=&page=&limit=`                       | `200 { query, results: SearchResult[], total }`                                        |


```ts
type Asset = {
  id: string; originalName: string; mimeType: string; kind: 'text' | 'image'; sizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'failed'; error: string | null;
  title: string | null;          // short caption, shown as the name on the detail page ("Black cat")
  description: string | null;    // shown on the detail page
  tags: string[];                // shown as chips on cards and the detail page (keywords stay server-side)
  extractedText: string | null;  // text-file body for the detail preview; images stay null
  contentUrl: string;   // relative: /api/assets/:id/content
  createdAt: string; updatedAt: string;
};
type SearchResult = { asset: Asset; score: number };
```

Error shape (every non-2xx): `{ "error": { "code": "...", "message": "...", "details"?: any, "requestId": "..." } }`


| Code                    | Status                                             |
| ----------------------- | -------------------------------------------------- |
| `VALIDATION_ERROR`      | 400 (bad query params, invalid ObjectId, no files) |
| `NOT_FOUND`             | 404                                                |
| `FILE_TOO_LARGE`        | 413                                                |
| `UNSUPPORTED_FILE_TYPE` | 415                                                |
| `AI_UNAVAILABLE`        | 503 (reprocess when provider is down)              |
| `INTERNAL`              | 500 (message not leaked; stack logged)             |




### Upload validation (`validation/fileType.ts`, `http/uploadParser.ts`)

- Allowed by extension **and** declared MIME; images verified by **magic bytes** (PNG `89 50 4E 47`, JPEG `FF D8 FF`,
GIF `47 49 46 38`, WEBP `RIFF....WEBP`) — hand-written, unit-tested.
- Text must decode as valid UTF-8 (use `new TextDecoder('utf-8', { fatal: true })`).
- busboy `limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 10 }`; if `file.truncated` → delete the partial GridFS file → 413.
- Never use the client filename for anything but display.

As built (`validation/contentInspector.ts`): validation happens **while the bytes stream**, never on a
buffered copy. A failed check is *recorded* rather than thrown into the pipeline — erroring the
transform destroys busboy's file stream and deadlocks the parser, which waits for every file stream to
be consumed. Every exit path drains the stream and deletes any GridFS file the request created, and
cleanup runs only after all concurrent file tasks have settled. Empty files are rejected as 400.
Uploads are all-or-nothing: one bad file fails the batch and removes the rest.

---



## 7. Configuration (`server/.env`, validated in `config.ts`)


| Var                                 | Default                         | Notes                                              |
| ----------------------------------- | ------------------------------- | -------------------------------------------------- |
| `PORT`                              | `3000`                          |                                                    |
| `MONGODB_URI`                       | `mongodb://localhost:27017/kms` | Atlas URI in production                            |
| `NODE_ENV`                          | `development`                   | `development` \| `production` \| `test`            |
| `AI_PROVIDER`                       | `gemini`                        | `gemini` \| `fake` (implemented providers only)    |
| `GEMINI_API_KEY`                    | —                               | required when `AI_PROVIDER=gemini`                 |
| `AI_MODEL`                          | `gemini-3.8-flash`              | override the provider's default model id           |
| `AI_CONCURRENCY`                    | `2`                             | assets analysed at once, so one bulk upload cannot exhaust the quota |
| `MAX_UPLOAD_MB`                     | `10`                            |                                                    |
| `LOG_LEVEL`                         | `info`                          | `debug`                                            |
| `CLIENT_DIST_DIR`                   | `../client/dist`                | served in production; SPA fallback excludes `/api` |


Every new env var → `config.ts` + `server/.env.example` + this table.
`loadConfig` collects **all** problems and throws one error listing them; `describeConfig` is the only
thing logged at startup (API key dropped, Mongo credentials redacted).

Client dev-only: `API_PROXY_TARGET` (default `http://localhost:3000`) overrides the Vite `/api` proxy
target when the server runs on another port.

Local MongoDB: `docker run -d --name kms-mongo -p 27017:27017 mongo:7` (or a free Atlas cluster).

---



## 8. Container & deployment

**Image:** one multi-stage `Dockerfile` at repo root.

1. Build client (`npm ci`, `npm run build` → `client/dist`).
2. Build server (`npm ci`, `tsc` → `server/dist`, `npm prune --omit=dev`).
3. Runtime `node:22-slim`: copy `server/dist`, `server/node_modules`, `server/package.json`, `client/dist`;
  `NODE_ENV=production`, `PORT=3000`; run as non-root `node`; `EXPOSE 3000`; `CMD ["node","server/dist/index.js"]`.

`.dockerignore`: `**/node_modules`, `**/dist`, `**/.env`, `.git`, `*.pdf`, coverage, plus the
docs/tooling the image never needs (`agent_mds`, `samples`, `*.md` except `README.md`).

Implemented extras: `CLIENT_DIST_DIR=/app/client/dist` is baked in (the `../client/dist` default is
relative to the working directory and would not resolve in the image); `HEALTHCHECK` polls
`/api/health` and fails while `db` is not `up`; exec-form `CMD` so node is PID 1 and the SIGTERM
handler in `index.ts` shuts down gracefully.

The container is **stateless** (all data in MongoDB/GridFS), so any container host works.

**Database:** MongoDB Atlas free cluster (allow the host's egress IPs, or `0.0.0.0/0` for the assignment — note it in README).

**Host options (not Fly.io):**


| Host                                      | Pros                                                     | Cons                                              |
| ----------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| **Render** (Docker web service) — default | Deploys from GitHub repo + Dockerfile, free tier, simple | Free instances sleep → ~30–60 s cold start        |
| Google Cloud Run                          | Fast cold starts, generous free tier, scales to zero     | Needs GCP project + billing account, gcloud setup |
| Railway                                   | Very simple, deploy from GitHub                          | Trial credits, then paid                          |
| Azure Container Apps / AWS App Runner     | Enterprise-standard                                      | More setup                                        |
| Record the final choice in `STATUS.md`.   |                                                          |                                                   |


**Checklist**

- [x] `docker build` works from a clean clone; container starts with only documented env vars.
- [x] Startup fails fast with a clear message if `MONGODB_URI` or the AI key is missing.
- [ ] Deployed `/api/health` 200; UI at `/`; deep link `/assets/<id>` works. _(verified locally in the container; deployment is M6)_
- [ ] Both brief examples work on the deployed URL; demo assets seeded from `samples/`.

**README checklist:** overview + live URL + screenshot · features ↔ brief · architecture diagram · how search
works and why · run locally (with `AI_PROVIDER=fake` option) · tests · Docker · deploy · config table ·
design decisions & trade-offs (from `STATUS.md`) · limitations & next steps · **AI tools used**.