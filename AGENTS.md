# AGENTS.md — Knowledge Management System (Ness home assignment)

Loaded on every prompt. Entry point only — details live in `agent_mds/`:

| File | Contents | Read when |
|------|----------|-----------|
| `agent_mds/PROJECT.md` | Requirements (R1–R4), stack, architecture, AI options, data model, search, API, config, deployment | Before touching any feature, contract, or infra |
| `agent_mds/WORKFLOW.md` | The per-prompt loop, coding standards, Vitest unit testing, Postman API testing, debugging playbook | Every coding prompt |
| `agent_mds/STATUS.md` | Milestones, decision log, known issues, session notes | Start of each session; update at the end of each task |

## Mission
A full-stack **Knowledge Management System**: upload **text files and images**, view them, and have an
**AI service generate searchable metadata** (description, tags, keywords, visible text, category terms)
that is **stored in MongoDB** and powers **smart search** — "black hair" finds images with black hair and
text mentioning it; "document" finds photos of documents and text referencing documents.
Delivered as a **containerized app deployed online**, on GitHub, with a README that includes **"AI tools used"**.
Graded on engineering approach and decisions; the candidate must be able to explain every line.

## Stack (fixed — change only via a `STATUS.md` decision)
Server: Node 20 + TypeScript + Express + **Mongoose/MongoDB** (files in **GridFS**) + **busboy** uploads ·
AI: hosted multimodal LLM behind `AiProvider` (+ `FakeAiProvider`) ·
Client: React + Vite + TypeScript + **Tailwind CSS** + custom fetch hooks ·
Tests: **Vitest unit tests** (client + server) + **Postman** collection for the API ·
Deploy: one Docker image + MongoDB Atlas on a container host (not Fly.io).

## Hard rules
- **MongoDB is the only data store.** No SQLite, no local-disk file storage.
- **Search runs only in the database** (MongoDB `$text` + escaped-regex fallback). No in-app ranking/vector math.
- **No caching of any kind:** `Cache-Control: no-store`, ETag off, no memoization/in-memory stores, client `fetch` with `cache: 'no-store'`.
- **Banned:** multer, zod, pino, TanStack Query, Fly.io.
- **Tests:** Vitest only, unit tests only, never touch real Mongo / network / AI. API behavior → Postman collection in `postman/`.
- **Contract changes** update together: `PROJECT.md` §6, server + client `types/api.ts`, Postman collection.
- **Secrets** only in `.env` (gitignored); keep `.env.example` current.
- **Don't commit or push unless asked.**
- **Windows + PowerShell:** chain with `;`, env vars via `$env:X="y"`, quote paths (repo is under OneDrive).

## Per-prompt loop (details in `WORKFLOW.md` §1)
1. **Understand** — goal in one line, map to R1–R4, read relevant code + docs, check hard rules.
2. **Plan** — todo list: files, unit tests, Postman requests, verification.
3. **Code** — follow `WORKFLOW.md` §2.
4. **Test** — Vitest unit tests + typecheck + lint; Postman for endpoints; browser click-through for UI.
5. **Debug** — `WORKFLOW.md` §5: reproduce → evidence → one hypothesis → root-cause fix → regression test.
6. **Insight** — end the reply with the Insight block (what/why, verified by, trade-offs, risks, interview talking point, next step).
7. **Record** — update `STATUS.md`.

## Commands (PowerShell)
```powershell
docker run -d --name kms-mongo -p 27017:27017 mongo:7    # local MongoDB
cd server; npm install; npm run dev                      # http://localhost:3000
cd client; npm install; npm run dev                      # http://localhost:5173 (proxies /api)
npm run typecheck; npm run lint; npm test                # in each package
npx newman run postman/kms.postman_collection.json -e postman/local.postman_environment.json
docker build -t kms .; docker run --rm -p 3000:3000 --env-file server/.env kms
```
