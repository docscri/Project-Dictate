# Dictate

Dictate is a clinical dictation app with a React frontend and FastAPI backend. The frontend can run with sample data or connect to the backend. Live speech and note generation need the appropriate server-side provider settings.

## Project map

- `dictate-app/backend/` — FastAPI app, migrations, configuration and backend tests.
- `dictate-app/frontend/` — React/Vite app, frontend tests and browser fixtures.
- `dictate-app/docs/README.md` — documentation index.
- `dictate-app/docs/backend_contracts.md` — current API request and response contract.
- `dictate-app/docs/ui-boards/` — the 19 current reference boards.
- `dictate-app/docs/qa/` — historical implementation and acceptance reports.

## Requirements

- Python 3.14 for the checked backend environment and type checker.
- Node.js 22.12 or newer (or 20.19 or newer) and npm.
- Microsoft Edge to run the browser fixture checks.

## Start the backend

In PowerShell, from the project root:

```powershell
cd dictate-app/backend
py -3.14 -m venv .venv
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Fill the required Supabase settings in `dictate-app/backend/.env`. That file is ignored by Git. The backend needs Supabase to start. Deepgram is needed for live speech; a Google AI Studio key (`GEMINI_API_KEY`) is needed for note generation through the Gemini API, including the configured Gemma model. AWS credentials are needed only when term extraction is enabled. Keep these credentials on the server.

In `backend/config.yaml`, `ai.ner_enabled: false` generates notes directly from the saved transcript, with no AWS request and no clinical term highlights. Set it to `true` to use AWS Comprehend Medical after the account permits `DetectEntitiesV2`. Use a YAML boolean, not a quoted string. If the setting is omitted, extraction remains enabled for compatibility. Restart the backend after changing configuration.

Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API health check is `http://127.0.0.1:8000/health`; interactive API documentation is at `http://127.0.0.1:8000/docs`.

## Start the frontend

In a second PowerShell terminal, from the project root:

```powershell
cd dictate-app/frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. Real backend mode is the default and uses the API at `http://localhost:8000`. To preview with sample data, set `VITE_USE_MOCK=true` in `frontend/.env.local` and restart Vite. Frontend environment files must never contain service keys.

## Checks

Install backend runtime and development packages as shown above, then add the type checker:

```powershell
cd dictate-app/backend
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Run the standard lint, type, unit, dependency and production-build checks from the project root:

```powershell
.\scripts\verify.ps1
```

For the browser fixture checks, keep backend/provider keys out of the test server. Start Vite in an isolated terminal configured for the fixture API:

```powershell
cd dictate-app/frontend
$env:VITE_USE_MOCK='false'
$env:VITE_API_BASE_URL='http://127.0.0.1:8765'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Then, in another terminal from `dictate-app/frontend`, run `npm run test:browser`. Each browser suite starts and stops its own API fixture on port 8765; run them sequentially.

## Database changes

SQL migrations live in `dictate-app/backend/shared/db/migrations/`. Apply them in numerical order through the database migration process. Migration 006 adds indexes for consultation paging and patient search; check its query plans after applying it to the target database.

## Project notes

Current frontend and backend follow-ups are in `dictate-app/docs/FRONTEND_NOTES.md` and `dictate-app/docs/BACKEND_GAPS.md`; start at `dictate-app/docs/README.md`. Past batch reports are stored under `dictate-app/docs/qa/`. Do not treat a historical report as the current service state.
