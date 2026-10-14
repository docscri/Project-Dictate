# Architecture

Dictate is a React frontend with a FastAPI backend and Supabase for authentication and persistence.

```text
backend/   FastAPI routes, services, shared providers, migrations and tests
frontend/  React screens, hooks, shared API/audio/realtime clients and styles
docs/      Current product and architecture notes
```

The backend is started from `backend/` with the virtual environment Python. The frontend is started from `frontend/` with Vite. The backend loads `backend/.env` and `backend/config.yaml`. Copy `backend/setup/.env.example` to `backend/.env` and `backend/setup/config.example.yaml` to `backend/config.yaml` for a new local setup. Runtime dependencies are in `backend/requirements.txt`; development dependencies are in `backend/setup/requirements-dev.txt`.

```powershell
# backend
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000

# frontend, in another shell
cd frontend
npm install
npm run dev
```

The frontend talks to the backend through the shared API client. HTTP requests use `Authorization: Bearer <access_token>`. The dictation WebSocket is `WS /api/dictation/stream/{consultation_id}?token=<access_token>`. Microphone capture and audio conversion belong to the frontend; the backend receives raw 16-bit, 16 kHz, mono PCM audio.

Backend routes are grouped under `/api/auth`, `/api/profile`, `/api/patients`, `/api/consultations`, `/api/dictation` and `/api/note-formats`. `/health`, signup, login, refresh and note-format reads are public. Protected HTTP routes require a bearer token. Data is always scoped to the authenticated doctor.

All backend errors use this shape:

```json
{"code":"error_code","message":"Safe message.","fields":[]}
```

Provider, SQL, Python and credential details are logged only. WebSocket errors use the same `code`, `message` and `fields` fields inside a WebSocket error event. Consultation status exposes `processing_stage`, `processing_error`, `last_processing_stage` and `retryable`. Note processing records `processing_started_at`; sidebar loading and status polling convert work abandoned beyond `note.processing_timeout_seconds` into a retryable failure without deleting the transcript.

Database changes are versioned in `backend/shared/db/migrations`. Apply migrations through the project database process; the application does not run schema changes automatically. Backend tests use isolated provider fixtures and run with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests
.\.venv\Scripts\python.exe -m pyright --project ..\pyrightconfig.json
.\.venv\Scripts\python.exe -m pip check
```
