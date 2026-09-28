# WORKFLOW — Code, Test, Debug & Insight (one loop per prompt)


---

## 1. The loop

### Step 0 — Orient (new session)

- Read `STATUS.md` (current milestone, decisions, known issues). Don't relitigate decisions without a reason.

### Step 1 — Understand

- Restate the goal in one sentence; map it to requirement IDs (R1–R4 in `PROJECT.md`).
- Read the code you'll touch and the relevant `PROJECT.md` section **before** editing.
- Check the **global constraints** in `PROJECT.md` §1 (MongoDB only, no caching, no multer/zod/pino/TanStack/Fly.io, Tailwind, Vitest unit only).
- Ambiguous *and* expensive to reverse (data model, API shape, vendor, host)? Ask one focused question. Otherwise choose a sensible default, state it, proceed.



### Step 2 — Plan

- Non-trivial task → short todo list: files to change, unit tests to add, UI flows to click through, how to verify.
- Prefer vertical slices (route + service + repository + test + UI) over half-built layers.



### Step 3 — Code

- Follow §2 standards. Respect layering and the API contract.
- Contract change → update `PROJECT.md` §6, `server/src/types/api.ts`, and `client/src/api/types.ts` together.
- New env var → `config.ts` + `PROJECT.md` §7 + README config table.



### Step 4 — Test (never skip)

- Add/update Vitest unit tests (§3) for the logic you changed.
- Run for each touched package:
  ```powershell
  npm run typecheck; npm run lint; npm test
  ```
- Endpoint or UI work: run both dev servers and click through the library: upload → status turns `ready` → search finds it → detail renders.
- Not done while anything is red. Pre-existing unrelated failure → say so and add it to `STATUS.md` known issues.



### Step 5 — Debug (whenever something fails or looks wrong)

Follow §5: reproduce → evidence → one hypothesis → minimal root-cause fix → regression unit test → remove debug logs.
Never: retry blindly, weaken assertions, swallow errors, disable type/lint rules.

### Step 6 — Insight (end of every coding reply)

```markdown
### Insight
- **What changed & why:** <1–3 sentences, tied to R1–R4>
- **Verified by:** <commands/collections run + results>
- **Trade-offs / alternatives:** <chosen vs. rejected, and why>
- **Risks / limitations:** <edge cases not handled, known gaps>
- **Interview talking point:** <the non-obvious thing to be ready to explain>
- **Next step:** <most valuable next task>
```

Skip empty bullets. Be honest about what was **not** verified.

### Step 7 — Record

Update `STATUS.md`: tick milestones, add decision-log rows for non-trivial choices (with the rejected
alternative), update known issues, append a one-line session note.

### Prompt-type cheat sheet


| Prompt                  | Do                                                                   |
| ----------------------- | -------------------------------------------------------------------- |
| "Build / add X"         | Steps 1–7                                                            |
| "X is broken / error …" | 1 → 5 → 4 → 6 → 7                                                    |
| "Write tests for X"     | 1 → 4 (→ 5 if bugs found) → 6                                        |
| "Explain X / why …"     | Read code + `STATUS.md` decisions → answer with trade-offs; no edits |
| "Deploy"                | `PROJECT.md` §8 checklist → click through the deployed UI → 6 → 7    |
| "Finish / README"       | Tick every R1–R4 box, then README checklist in `PROJECT.md` §8       |




### Response style

Lead with the outcome, then details. Reference files by path; show only relevant snippets.

---



## 2. Coding standards



### General

- TypeScript `strict` + `noUncheckedIndexedAccess`, ES modules, Node 20 LTS. No `any` (use `unknown` + narrowing), no `@ts-ignore`.
- ESLint (typescript-eslint recommended) + Prettier defaults.
- Naming: `camelCase` functions/vars, `PascalCase` types/components, `SCREAMING_SNAKE` constants; server files `camelCase.ts`, React components `PascalCase.tsx`.
- Small single-purpose functions; keep logic **pure** where possible (validators, query builders, metadata parsing, formatting) so it is unit-testable without Mongo or the network.
- Comments explain *why* (constraints, trade-offs), never narrate *what*. No commented-out code.
- Add dependencies only with a reason, via `npm install` (never hand-written versions). Respect the banned list.
- The candidate must be able to explain every line — prefer readable over clever.



### Server

- **Layering:** routes → services → repositories/storage/ai. Mongo queries only in `repositories/`; GridFS only in `storage/`; vendor SDK only in `ai/<vendor>Provider.ts`.
- **DI:** `createApp(deps)`; no hidden singletons except `config` and `logger`.
- **Validation:** hand-written functions in `validation/` returning typed values or throwing `AppError('VALIDATION_ERROR', 400, …)`. Validate at the boundary (params, query, env, AI output); after that, trust the types. Mongoose schema enforces document shape.
- **ObjectIds:** validate with `mongoose.isValidObjectId` before querying → 400, not 500.
- **Errors:** throw `AppError`; one `errorHandler` maps to the error shape; unknown errors → 500 `INTERNAL` (stack logged, not returned). Wrap async route handlers so rejections reach the handler.
- **Logging:** `logger.ts` only (no `console.log` elsewhere). Structured: `log.info({ requestId, assetId, durationMs }, 'asset processed')`. Log AI call duration/model. Never log file bytes, API keys, or full extracted text.
- **No caching:** no memoization of DB/AI results, no in-memory maps of assets, `Cache-Control: no-store`, ETag disabled.
- **Mongo safety:** never build query objects from raw user input keys; escape regex input; use `lean()` for reads that map to DTOs.
- **AI:** always via `AiProvider`; timeout + limited retries; output through `parseMetadata()`; failures set `status: 'failed'` + `error`, never crash the process.
- **Uploads:** busboy streams to GridFS; clean up partial files on error/limit; generated storage ids only.
- `index.ts` is wiring only.



### Client

- Function components + hooks. Server data via custom hooks in `hooks/` built on `api/client.ts` (`fetch` with `cache: 'no-store'`, `AbortController` for stale requests). No TanStack Query or other data libraries.
- Polling: `useAsset` / library polls with `setInterval` only while any asset is `pending|processing`; clear on unmount.
- Search: debounce 300 ms, state in URL query string.
- Every async view handles **loading, error, empty, success**.
- **Tailwind CSS** utilities for all styling; shared patterns via small components, not custom CSS files. Clean, modern, responsive grid; dark text on light background by default.
- Accessibility: labelled inputs, real `<button>`s, `alt` text (use AI description when available), keyboard-usable dropzone.
- Types from `api/types.ts` only.



### Git (only when the user asks)

Small focused commits, imperative messages. Never commit `.env`, `node_modules/`, `dist/`, coverage.

---



## 3. Unit testing (Vitest — client and server)



### Rules

- **Unit tests only** for now: pure functions and services with injected fakes. No real MongoDB, no network, no real AI.
- Fakes: `FakeAiProvider`, hand-written in-memory fake repository/storage objects or `vi.fn()` stubs implementing the same interfaces.
- Deterministic: no timers without `vi.useFakeTimers()`, no randomness without seeding.
- Test behavior (inputs → outputs / resulting calls), not private details.
- **Every bug fix ships with a regression test.** Never delete/weaken an assertion to go green without explaining why.
- Files: `server/test/unit/**/*.test.ts`, `client/src/**/*.test.ts` (co-located). Vitest `environment: 'node'` for both (client tests cover `lib/` and `api/` logic, not rendering).



### What to cover (priority order)

**Server**

- `validation/fileType`: allowed/blocked extensions and MIME, magic-byte mismatch (text renamed `.png`), invalid UTF-8 "text".
- `validation/query`: `q` trimming/length, `kind` values, `page`/`limit` bounds, invalid ObjectId.
- `ai/parseMetadata`: malformed JSON rejected; tags lowercased/trimmed/deduped/capped; missing fields.
- `ai/fakeAiProvider`: deterministic output from filename/text.
- Search query building (pure function producing the Mongo filter/sort): `$text` filter, kind filter, `status: 'ready'`, regex fallback escapes special chars (`.*+?()[]{}|^$\`).
- `processingService` (fake repo + fake/stub provider): pending → processing → ready with metadata saved; provider throws → `failed` + error; retries only on retryable errors.
- `http/errors` / `errorHandler` mapping: AppError → shape; unknown error → 500 without leaking message.
- `config`: missing `MONGODB_URI` / API key → clear error.

**Client**

- `lib/validateFile`: type/size checks mirror the server rules.
- `lib/formatBytes`, `lib/buildQueryString`.
- `api/client`: parses the error shape into `ApiError`; non-JSON error body handled.
- Debounce / polling helpers if extracted as pure functions.



### Commands (PowerShell)

```powershell
npm test                                  # run once
npm run test:watch
npx vitest run test/unit/fileType.test.ts # single file
npx vitest run -t "magic bytes"           # by name
npm run test:coverage
```

---



## 4. UI verification

The frontend is how the API is exercised end-to-end. After any route, service, or UI change:

- Run the server against local Mongo and the Vite client (`API_PROXY_TARGET` if the server is not on 3000).
- Click through the path a user would take: upload → card appears → status becomes `ready` → search finds it → detail page renders the title and preview.
- Cover the error states the change can hit (unsupported type, empty search, missing asset) from the UI, not from a separate API collection.

---



## 5. Debugging playbook



### Method

1. **Reproduce** exactly (command, UI click, input file). Tests: run the single test.
2. **Read the full error**; find the first stack frame in our code. For HTTP errors take `requestId` from the response and grep the server logs.
3. **Inspect state:** the asset document (`status`, `error`, tags), the GridFS file, the loaded config (logged at startup without secrets), indexes (`db.assets.getIndexes()`).
4. **One hypothesis at a time**, verified by a targeted check (log line, unit test, mongosh query). Disproved → next hypothesis; don't stack fixes.
5. **Fix the root cause** minimally; add a regression unit test; remove temporary logs; rerun typecheck/lint/tests (and the UI path if an endpoint was involved).
6. **Explain** in Insight: symptom → root cause → fix → prevention.

Two failed attempts on the same idea → stop, summarize evidence, rethink or ask the user.



