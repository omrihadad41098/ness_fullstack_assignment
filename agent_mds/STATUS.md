# STATUS — Progress, Decisions & Known Issues

Living document. **Read at the start of every session; update at the end of every task.**

## Current status
- **Milestone:** M0–M5 **done** — the app is feature-complete locally and in a container. Next: M6 (deploy), then M7 (README).
- **Open choices:** Host (default Render, alt. Cloud Run / Railway).
- **Settled:** AI vendor = Google Gemini `gemini-3.8-flash` via the Interactions REST API, plus the offline `fake` provider (D31).
- **Blocking M6/M7:** no `GEMINI_API_KEY` yet, so the real provider has only been exercised through unit tests with a stubbed `fetch`; and `samples/` still needs two real photographs.

## Milestones
- [x] **M0 Scaffolding** — server (TS, Express 5, Mongoose connection, logger, config, `/api/health`, noCache + requestId + errorHandler + notFound), client (Vite React TS + Tailwind v4 + router + proxy), Vitest in both (35 tests), ESLint/Prettier, `.gitignore`, `.env.example`.
- [x] **M1 Upload & view (API)** — Asset model + indexes, GridFS storage, busboy upload parser, file validation (extension + MIME + magic bytes + UTF-8), `POST/GET /api/assets`, `/:id`, `/:id/content`, `DELETE`, 57 new unit tests. The library/detail **UI** for these endpoints is M4.
- [x] **M2 AI metadata** — `AiProvider` seam, Gemini provider (Interactions REST, JSON response schema, 30 s timeout, retry on 429/5xx only), deterministic fake provider, prompts (`PROMPT_VERSION`), `parseMetadata` trust boundary, `createLimiter` + `processingService` (claim/ready/failed transitions, bounded concurrency), startup recovery, `POST /api/assets/:id/reprocess`, 47 new unit tests.
- [x] **M3 Smart search** — `searchFilters.ts` (weighted `$text` + escaped-regex fallback), `assetRepository.search`, `searchService` with `matchedTags`, `GET /api/search`, `parseSearchQuery`, 25 new unit tests.
- [x] **M4 Client UI** — library grid with upload dropzone, debounced search, kind filter, pagination, status polling, asset detail page with preview + remove, loading/error/empty states, `validateFile` unit tests.
- [x] **M5 Container** — multi-stage `Dockerfile` (client build → server build+prune → `node:22-slim` runtime), `.dockerignore`, non-root `node` user, `HEALTHCHECK`, 346 MB image, run locally against Mongo. Built early so every later milestone is verified in the shape that gets deployed.
- [ ] **M6 Deploy** — Atlas cluster, host setup, env vars, UI click-through against the deployed URL, `samples/` seeded.
- [ ] **M7 README** — full README incl. **AI tools used**; all R1–R4 boxes in `PROJECT.md` ticked.

## Decision log
Short "why" and "rejected" — these are interview answers.

| # | Decision | Why | Rejected |
|---|----------|-----|----------|
| D1 | TypeScript end-to-end (Express + React/Vite) | One language, mirrored DTO types | Python backend |
| D2 | MongoDB (Mongoose) for all persistence | User constraint; flexible document for AI metadata; built-in text search | SQLite, Postgres |
| D3 | Files in GridFS | Stateless container → deploy anywhere; single data store | Local disk volume, S3 |
| D4 | Search = MongoDB `$text` (weighted) + escaped-regex fallback, DB only | User constraint; weights favor AI tags/keywords; stemming; fallback covers partial words | In-memory ranking, Elasticsearch, embeddings in app |
| D5 | AI prompt must emit synonyms + broad categories | Makes "document" match a receipt photo without vector search | Embeddings (needs vector DB/Atlas Vector Search) |
| D6 | Hosted multimodal LLM behind `AiProvider` + `FakeAiProvider` | Handles images + text in one call; swappable; offline unit tests | Vision-label APIs (no text, fixed vocabulary), self-hosted models (heavy) |
| D7 | Async in-process processing with `status` field | Fast uploads; AI failures non-fatal; reprocessable | Synchronous processing, external queue |
| D8 | No caching (`no-store`, ETag off, no memoization) | User constraint; every request reflects DB state | HTTP/in-memory caching |
| D9 | busboy for multipart | Streams straight into GridFS, enforces limits | multer (banned), base64 JSON uploads |
| D10 | Hand-written validators + Mongoose schema validation | zod banned; small pure functions are easy to test | zod, joi |
| D11 | Console-based JSON logger wrapper | pino banned; structured logs without a dependency | pino, winston |
| D12 | Custom fetch hooks with AbortController + polling | TanStack Query banned; small and explainable | TanStack Query, SWR |
| D13 | Tailwind CSS | User choice; fast consistent styling | CSS modules, UI kits |
| D14 | Vitest (unit only) for client + server; the UI for API behaviour | One test library for both; a user already has a frontend, so a second HTTP harness is extra work | Jest, supertest, Playwright, Postman |
| D15 | Single Docker image serving API + built client | One URL, no CORS, simple deploy | Separate static hosting |
| D16 | Node 22 LTS (not 20), Express 5, React 19, Tailwind v4 | Current toolchain requires it — Mongoose 9 needs Node ≥20.19, Vitest 5 needs Node ≥22.12 | Pinning Node 20 + older majors |
| D17 | `loadConfig(env)` is a pure function that collects every problem before throwing | Unit-testable without touching `process.env`; a misconfigured deploy sees all errors in one restart | Reading `process.env` inline; failing on the first problem |
| D18 | No `asyncHandler` wrapper | Express 5 forwards rejected handler promises to the error middleware natively | Hand-rolled wrapper on every route |
| D19 | Unit tests use hand-written fake `req`/`res` objects | Keeps "unit tests only, no supertest" while still covering middleware behaviour | supertest (banned), booting a real server |
| D20 | `CLIENT_DIST_DIR` baked into the image as an absolute path | The `../client/dist` default resolves against the working directory and breaks in the image; absolute removes the coupling | Changing `WORKDIR` to `/app/server` so the relative default happens to work |
| D21 | `HEALTHCHECK` asserts `db: "up"`, not just HTTP 200 | An API that answers but cannot reach MongoDB is useless; hosts should restart/park it | Plain TCP or status-code-only check |
| D22 | Separate `npm ci` layer from source `COPY` in both build stages | Dependency install (~35 s) is cached until a lockfile changes, so code edits rebuild in seconds | Single `COPY . .` before install |
| D23 | `node:22-slim` runtime (346 MB), not alpine | glibc matches the build stage, so native deps cannot break between stages; size is not a grading criterion | `node:22-alpine`, distroless |
| D24 | Content validated **while streaming**, never buffered | A 10 MB image would otherwise sit in RAM ×10 concurrent files; the inspector judges magic bytes from the first 12 bytes and UTF-8 incrementally | Buffering each file to validate it |
| D25 | A failed inspection records the error instead of erroring the transform | Erroring the transform destroys busboy's file stream and deadlocks the parser (it waits for that stream to be consumed); bytes keep flowing and the file is deleted afterwards | Aborting the pipeline mid-file |
| D26 | Upload is all-or-nothing: any bad file fails the whole request and deletes the rest | Partial success would need a per-file result shape in the API and leave the user guessing what landed | Per-file 207-style results |
| D27 | Cleanup waits for every in-flight file to settle before deleting | Files finishing *after* the first failure were being orphaned in GridFS — found by a unit test, not in review | Cleaning up immediately on first failure |
| D28 | `parseObjectId` uses a 24-hex regex, not `mongoose.isValidObjectId` | `isValidObjectId('abcdefghijkl')` is true, so a typo would surface as a confusing 404 instead of a 400 | Mongoose's helper |
| D29 | Routes own multipart parsing; services take domain objects | Multipart is an HTTP concern, so `req` stays out of the service layer and the service is testable with plain objects | Passing `req` into the service |
| D30 | Delete removes the document first, GridFS file second | A failed byte delete leaves a harmless orphan; the reverse order would leave an asset the UI lists but cannot open | Deleting bytes first, two-phase commit |
| D31 | Gemini `gemini-3.8-flash` only, called over raw `fetch`; `openai` removed from `AI_PROVIDER` | A second untested provider is a liability, and accepting a value `createAiProvider` ignores would silently run the wrong model. No SDK keeps the dependency surface small and the request readable | Shipping an unexercised OpenAI provider; `@google/genai` SDK |
| D32 | `parseMetadata` treats model output as untrusted input and throws on anything unusable | An LLM is a remote system that can return prose, fenced JSON or junk; throwing marks the asset `failed` instead of polluting the search index with garbage | Casting the parsed JSON; storing whatever came back |
| D33 | Retry only `RetryableAiError` (429/5xx/network), never 4xx | Retrying a bad key or malformed request burns quota and delays the `failed` status the user needs to see | Blanket retry with backoff |
| D34 | `claimForProcessing` is a conditional `findOneAndUpdate`, not read-then-write | The status filter *is* the lock: concurrent workers or a reprocess arriving mid-analysis can only produce one winner, because MongoDB applies the update once | Application-level mutex, external queue |
| D35 | Hand-written `createLimiter`, bounded by `AI_CONCURRENCY` | Uploading ten files must not fire ten paid AI calls at once; fifteen lines beats a dependency and the semantics matter | `p-limit`, unbounded `Promise.all` |
| D36 | Text files: prompt gets the first 8 000 chars, but the full text is stored as `extractedText` | The file's own words are the best search material there is; the model's echo of them is not | Storing the model's `extractedText` for text files |
| D37 | Reprocess resets the asset to `pending` *before* queueing | The 202 response then already reflects the new state, so the client can poll without guessing | Returning the stale asset; fabricating a `processing` status |
| D38 | Regex fallback ANDs the terms and skips `extractedText` | Extra words should narrow a search, not widen it; an unindexed substring scan over whole documents is the one query here that would not scale | `$or` across terms; including `extractedText` |
| D39 | Fallback results carry `score: 0` | There is no `textScore` for a regex match, and inventing one would be a ranking computed in Node — exactly what the constraint forbids | Synthesising a relevance number |
| D40 | `matchedTags` computed in the service, not the database | It explains *why* a result matched; it never reorders or filters, so ranking stays entirely MongoDB's | `$meta: 'searchHighlights'` (Atlas-only); no explanation at all |
| D41 | `useLibrary` derives `loading` by comparing the requested key with the loaded one | Setting state at the top of an effect costs a render per keystroke and is what `react-hooks/set-state-in-effect` flags; it also lets a background poll refresh data without blanking the grid | `setLoading(true)` inside the effect |
| D42 | Clearing the search box bypasses the 300 ms debounce | Deleting a query is deliberate, not typing; waiting leaves "0 results matching …" on screen for a query the user already removed | Debouncing every change equally |
| D43 | Polling stops as soon as an asset is `ready` | An open detail page should not poll forever; only unfinished work justifies the traffic | Fixed-interval polling regardless of status |
| D44 | UI shows only the AI title ("Black cat"); tags, keywords, description, filename and MIME stay off-screen | Those fields exist so search can find the file, not so a user has to read them. A filename like `C:\Users\…\black-cat.png` is an implementation detail | Showing the full metadata panel; falling back to `originalName` |
| D45 | Dropped Postman/newman entirely | The library UI already covers upload, search, detail, reprocess and errors; keeping a parallel collection meant every contract change had three places to update | Keeping a Postman collection "just in case" |
| D48 | Cards show AI tags as chips (no name); detail page adds the title as the name plus the description. Keywords are search-only and not in the DTO. Supersedes D44/D46 | User request: tags explain *what* a file is at a glance; the name and prose belong one click deeper. Keywords are broad categories ("image", "photo") that help search but read as noise on screen; the original filename stays hidden | Title-only UI; showing keywords as a second chip tone; showing the filename as "name" |
| D47 | Failed upload insert also deletes documents by `fileId` before deleting bytes | `insertMany` is not atomic; a mid-batch failure could leave documents whose GridFS bytes were just deleted — listed but unopenable | Multi-document transaction (needs a replica set; local `mongo:7` is standalone) |
| D46 | Public Asset DTO omits description, tags, keywords and matchedTags | Those fields exist so MongoDB can rank search; sending them lets any UI (including a stale container build) render them. Search still uses them in the database | Sending them and hiding them in CSS/JS only |
| D49 | `extractOutputText` reads only `steps[type=model_output].content[type=text]` of the Interactions response | Observed on the first real call: the response is `{ steps: [thought, model_output] }`, not the guessed `output_text`/`output` envelopes. Thought steps are reasoning and must never be parsed as metadata. The guessed shapes were deleted instead of kept as fallbacks, because code for shapes that never occur cannot be explained or tested honestly | Keeping the speculative envelopes alongside the real one |

## Known issues / tech debt
- **This machine runs two MongoDBs**: a native Windows `mongod` on `127.0.0.1:27017` and the `kms-mongo` container publishing the same port. `host.docker.internal:27017` from inside a container reaches the *native* one, so the app silently used an empty database. Fixed by putting the app and Mongo on a `kms-net` Docker network and addressing Mongo by container name; documented in the README.
- ~~The Gemini provider has never made a real API call~~ — **resolved**: exercised with a real key (D49). The first call failed with "Gemini returned no text output" because the response envelope had been guessed; fixed and verified on images and text.
- Stray dev processes: an orphaned `tsx watch` started with `AI_PROVIDER=fake` survived in the background and, after a hot reload, won port 3100 from the new Gemini server — requests were silently processed by the fake provider. Check `Get-NetTCPConnection -LocalPort 3100` and the stored `aiProvider` field when results look wrong.
- The `pending → processing → ready` transition is invisible with the `fake` provider because it completes in microseconds. The UI polling was verified instead by flipping an asset's status directly in MongoDB and watching the detail page update itself.
- Port 3000 on this machine can be taken by unrelated containers of the user's (it was during M0, free again during M5). Docker's port proxy wins over a local Node listener on `localhost`, and the symptom is a confusing empty 404. Workaround: `PORT=3100` plus `API_PROXY_TARGET=http://localhost:3100` for the Vite proxy. Repo defaults stay 3000.
- `client/dist` must exist for Express to serve the SPA; otherwise it logs `client build not found — serving API only` (intended in dev).
- `samples/` currently holds synthetic files (`swatch.png` is a generated gradient). The two brief scenarios in M3 need **real photographs** — one of a person with black hair, one of a paper document/receipt. Those must be added before M3/M6 can be demonstrated honestly.
- The 413 oversize case is covered by a unit test and was verified manually with an 11 MB upload; it is not in `samples/`, because committing an >10 MB file just to trigger it is not worth the repo weight.
- `AssetModel.createIndexes()` runs at startup. Fine at this scale; on a large collection an index build would delay readiness and should move to a migration step.
- Assets analysed before the `title` field existed show **Untitled**. Search still works; only the on-screen label is missing. The UI no longer offers Re-analyse.

## Session notes
- 2026-09-27 — Agent docs created and consolidated (AGENTS.md + PROJECT/WORKFLOW/STATUS).
- 2026-09-27 — M0 scaffolding implemented and verified: typecheck/lint/tests green in both packages, `/api/health` returns `{ok, db up, fake}` against local Mongo, browser click-through of `/`, `/assets/:id`, unknown route.
- 2026-09-27 — M5 container implemented and verified: `docker build -t kms .` succeeds (346 MB), container serves `/api/health` (db up), the SPA at `/`, the deep link `/assets/abc` and hashed assets; runs as uid 1000 `node`; `HEALTHCHECK` reports healthy; `docker stop` exits 0 in 0.3 s (SIGTERM handled, no kill timeout); missing `MONGODB_URI` exits 1 listing every config problem.
  - Requires `server/package-lock.json` and `client/package-lock.json` to be committed — `npm ci` in the image depends on them.
- 2026-09-27 — M1 upload & view API implemented and verified: 78 unit tests green; 11 MB upload rejected with 413; `uploads.files`/`uploads.chunks` and `assets` all back to 0 documents after the run, so no path leaks GridFS data; indexes confirmed in mongosh including `asset_search_text` with the documented weights.
  - Two bugs found by the new unit tests before any manual testing: cleanup racing with in-flight uploads (D27) and a parser deadlock when a file was rejected before being drained (D25).
- 2026-09-27 — M2, M3 and M4 implemented and verified end to end: 146 server + 24 client unit tests green (68 new), typecheck and lint clean in both packages, UI click-through against the dev server and the rebuilt container.
  - Search verified against real data: `black hair` → the note that mentions it; `document` → two assets ranked by score; `documents` → identical total (stemming); `docu` → the regex fallback with `score: 0`; `.*` → 0 results (metacharacters escaped, not executed).
  - UI verified in the browser by dispatching a real `drop` event with `File` objects built in-page (the native file dialog cannot be driven): upload → library refreshes itself → search, filter, detail page, re-analyse and delete all work, no console errors.
  - Mongoose 9 renamed `FilterQuery` to `QueryFilter`; the old name no longer exists.
  - Two React lint errors (`set-state-in-effect`) were fixed by restructuring rather than suppressed — see D41.
- 2026-09-27 — UI no longer shows tags, keywords, filenames, MIME types or the long AI description. Cards and the detail page use the short AI title only (D44). 147 server + 28 client tests green.
- 2026-09-27 — Removed the Postman collection and every newman/Postman mention from the docs and comments (D45). API behaviour is verified through the UI.
- 2026-09-27 — Library cards now have a Remove button; tags/keywords/long description are no longer sent to the client (D46). Deleted the two leftover `swatch.png` uploads (test data, not a seed). 148 server + 28 client tests green; Vite and rebuilt Docker UI verified.
- 2026-09-27 — Header is the product name only. Removed the “API ok · DB up · AI fake” health chip from the UI; `/api/health` stays for Docker and ops.
- 2026-09-27 — Chips show tags only; `keywords` removed from the Asset DTO again (still indexed for search). 150 server + 34 client tests green; container verified.
- 2026-09-27 — Cards now show tag/keyword chips without a name; the detail page shows the title, description and full term list (D48). `description`/`tags`/`keywords` are back in the Asset DTO. 150 server + 34 client tests green; verified in the rebuilt container.
- 2026-09-27 — Reviewed create/delete. Fixed: filenames over 255 chars now 400 (were a Mongoose 500), and a partial `insertMany` failure no longer leaves assets pointing at deleted bytes (D47). 150 server tests green; live check: 400 / 202 / 200 / 204 / 404 / 400, 0 orphan GridFS files.
- 2026-09-27 — Removed Re-analyse from the file detail page. `POST /api/assets/:id/reprocess` stays on the server. Client 28 tests green; Vite and Docker detail pages show Library + Remove only.
- 2026-09-28 — `docker build` was broken on the committed code: `client/src/api/types.ts` had lost `description`/`tags` (server contract still had them), so `tsc` in the client stage failed. Restored both fields; client typecheck/lint/34 tests green, image builds, container healthy on :3000. The `kms-mongo` container had disappeared (local data lost) and was recreated on `kms-net`.
- 2026-09-28 — M6 prep: deploy audit found no code blockers (listens on platform `PORT`, accepts `mongodb+srv://`, stateless image, `.env` excluded from git and image). Added `render.yaml` (Docker web service, `/api/health` check, secrets `sync: false`). Blocked on account access: Atlas cluster + Render service must be created by the owner; `render.yaml` not yet committed/pushed.
- 2026-09-27 — README trimmed to reviewer essentials (overview, how it works, run, Docker, tests, config, API) and an "AI tools used" section added. Deploy URL still to add in M6. Container fix: `NODE_ENV`/`CLIENT_DIST_DIR` removed from `.env`, because `--env-file` overrode the image ENV and hid the UI (404 on `/`).
- 2026-09-27 — Running on real Gemini (`gemini-3.8-flash`). Fixed the response parser (D49); 149 server tests green, typecheck/lint clean. Re-analysed both photos (now "Sitting black cat", "Small apartment balcony" with real descriptions/tags) and uploaded a text note. Semantic search verified: `feline` → cat, `furniture` → balcony + office-chair note, `document` → note. Dev server (:3100 + Vite :5173) and rebuilt container (:3000) both report `aiProvider: gemini`.
