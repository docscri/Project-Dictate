# Backend guide for the frontend

This is the current backend behavior. Use `/docs` or `/openapi.json` for exact request fields.

## Main flow

1. Sign in.
2. Search for or create a patient.
3. Create a consultation.
4. Open the dictation WebSocket and send audio.
5. Show interim and final transcript text.
6. Finish dictation and poll status.
7. Show or edit the SOAP note and save it.

Patients and consultations belong to the signed-in doctor.

## Routes

Patients, consultations, profile, auth `me`, auth `logout` and dictation finish need `Authorization: Bearer <access_token>`. Health, signup, login, refresh and note-format routes are public. The dictation WebSocket takes its token in the URL.

| Method | Route | Action |
|---|---|---|
| GET | `/health` | Check the server. |
| POST | `/api/auth/signup` | Create an account with email, password, name and specialty. |
| POST | `/api/auth/login` | Sign in. |
| GET | `/api/auth/me` | Read the signed-in doctor's ID and email. |
| POST | `/api/auth/refresh` | Exchange a refresh token for replacement tokens. |
| POST | `/api/auth/logout` | Revoke the caller's refresh session; the client clears both tokens. |
| GET/PUT | `/api/profile` | Read or update name and specialty. |
| POST | `/api/patients` | Create a patient: name, optional age and sex (`male`, `female`, `other`). |
| GET | `/api/patients?query=<name>` | Search that doctor's patients by name. |
| GET | `/api/patients/{id}` | Read one patient. |
| POST | `/api/consultations` | Create one from patient ID. |
| GET | `/api/consultations?limit=50&offset=0` | Read a newest-first page of that doctor's consultation summaries. |
| GET | `/api/consultations/{id}` | Read a consultation, patient details, transcript and note. |
| GET | `/api/consultations/{id}/status` | Read status, processing stage and processing error. |
| PUT | `/api/consultations/{id}/note` | Save the four SOAP sections. |
| POST | `/api/consultations/{id}/pause` | Pause and finish receiving the last words. |
| POST | `/api/consultations/{id}/sign` | Sign a saved note and lock the consultation. |
| DELETE | `/api/consultations/{id}` | Delete the consultation; returns an empty `204`. |
| POST | `/api/dictation/finish` | Start note processing. |
| GET | `/api/note-formats` | List formats; currently only `default`. |
| GET | `/api/note-formats/{name}` | Read a format. |

There is no OTP, phone login, forgot password or patient editing.

Note-format and instruction loaders accept only the listed `default` name. Unknown names and filesystem paths are rejected; the public format route returns `404 not_found`.

Successful HTTP calls return `200`, except consultation deletion which returns `204` with no body. Patient create returns one patient; patient search returns a list. Consultation create, detail, pause, sign and note save return one consultation; consultation list returns a list. Only list and detail include the added patient summary. Profile GET returns one object; profile PUT currently returns a list of updated rows.

Consultation listing accepts `limit` (default 50, range 1–100) and `offset` (default 0, nonnegative). Results order by `created_at` descending, then `id` descending. Each row contains `id`, `doctor_id`, `patient_id`, `status`, `created_at` and the patient summary; full transcript, terms and note are fetched only by the detail endpoint. The response remains a JSON array. The frontend requests another page when its last row comes into view or receives keyboard focus, and deduplicates IDs. Concurrent inserts/deletes can move offset boundaries; reloading the list starts again from the newest page.

## Accounts and sessions

Signup requires:

```json
{"email":"doctor@example.com","password":"...","name":"Dr Example","specialty":"Cardiology"}
```

Use `specialty` for the department label. Signup saves the profile in the same request. If saving it fails, the backend attempts to remove the newly created account and profile; existing profiles are protected. Cleanup can still fail during a provider outage.

Login, signup and refresh return `user`, `access_token`, `refresh_token`, `expires_in` and `expires_at`. Signup also returns `confirmation_required`. If Supabase requires email confirmation, signup succeeds with null tokens: ask the doctor to confirm the email, then sign in.

Refresh with `{"refresh_token":"..."}` at `/api/auth/refresh`; no access token is required. Replace both stored tokens with the returned values. Invalid or revoked refresh tokens return `401 session_expired`.

Authentication-provider transport failures, timeouts, rate limits and server failures return `500 server_error` on login, refresh, logout and protected user verification. These failures do not mean the stored session is revoked. The frontend keeps its tokens and local work for a later user retry. WebSocket authentication-provider outages use close code `1011`; rejected credentials use `1008`.

Logout requires the access token and revokes that session's refresh ability, leaving other sessions alone. Clear both tokens in the frontend. An existing access token can remain valid until its expiry; logout does not instantly invalidate it.

Consultation list and detail responses retain `created_at` and include `patient: {id, name, age, sex}`. Patient details are fetched together and restricted to the doctor. If a matching patient is unavailable, `patient` is null.

Pause is allowed while dictating. It saves final words and closes the connection. Resume by opening the same consultation's WebSocket again; new words append to the transcript. A second active connection returns `stream_busy`. Unexpected disconnects also leave the consultation paused.

Delete removes the consultation, transcript, terms and note, keeping the patient. It closes any active stream first. Processing and signed consultations cannot be deleted. The frontend should ask for confirmation.

Sign is allowed only from `saved`. Signed consultations remain readable, but editing, recording, processing and deletion are blocked. There is no unsign action. Note edits are allowed in `ready`, `failed` and `saved`; finish processing before editing a dictated note.

| Action | Allowed consultation states | Result |
|---|---|---|
| Start or resume a WebSocket | `ready`, `paused`, `dictating` with no active stream | `dictating` |
| Pause | `dictating` | `paused` |
| Finish or retry processing | `dictating`, `paused`, `failed` | `processing`, then `saved` or `failed` |
| Save note | `ready`, `failed`, `saved` | `saved` |
| Sign | `saved` | `signed` |
| Delete | `ready`, `dictating`, `paused`, `saved`, `failed` | Consultation removed |

Blocked actions return `409`: signed records use `locked`, repeat finish during processing uses `already_processing`, and other unavailable transitions use `invalid_state`. Other doctors receive `404 not_found`.

## Dictation

Connect to `WS /api/dictation/stream/{consultation_id}?token=<access_token>`. Wait for `status: dictating`, then send binary audio frames. The server sends:

```json
{"type":"status","status":"dictating"}
{"type":"transcript","text":"patient reports chest pain","final":false}
```

`final: false` is temporary text. `final: true` is saved. The server does not promise word-by-word timing or recovery of audio missed during connection loss. WebSocket errors use `{"type":"error","code":"connection_error","message":"Audio connection lost. Please reconnect."}`; rejected streams may use `not_found`, `stream_busy`, `locked` or `invalid_state`. Invalid tokens are rejected with close code `1008`. Microphone errors belong to the browser.

## Browser connection settings

`config.yaml` and `config.example.yaml` now specify:

- Allowed frontend addresses: `http://localhost:5173` and `http://127.0.0.1:5173`.
- Allowed HTTP methods: GET, POST, PUT, DELETE and OPTIONS. Send tokens in `Authorization` and JSON with `Content-Type: application/json`; cookie credentials are disabled.
- Audio: raw 16-bit signed little-endian PCM (`linear16`), 16,000 samples per second, one channel. No WAV header or WebM/Opus container.

The frontend must convert and resample microphone audio before sending it. The backend forwards the bytes; these settings do not convert audio or prove its actual format. Deepgram requires encoding and sample rate for raw audio: [audio format documentation](https://developers.deepgram.com/docs/encoding).

Add the actual frontend address to `cors.allowed_origins` and restart the backend when changing ports or deploying. For phone/tablet testing, use the computer's reachable address rather than localhost and provide a secure browser context for microphone access. CORS controls HTTP browser access; the WebSocket continues to require its token.

Backend settings and automated tests are ready. Real browser recording, pause/resume, reconnect and transcription still need testing when the frontend exists. On connection loss, keep saved transcript text; do not promise recovery of missed audio.

## Processing states

After `/api/dictation/finish`, poll `/api/consultations/{id}/status`.

Finish accepts `dictating`, `paused` or `failed`. Only one request can claim processing; duplicates return `409 already_processing`. Retry a failed job through the same finish route using the saved transcript. Empty transcripts fail with `note_failed`.

With `ai.ner_enabled: false` in backend configuration, processing skips `extracting_terms` and sends an empty terms list to note generation. Saved notes have empty highlights; editing and signing use the same routes. With `true` (or an omitted setting), AWS extraction runs as before and extraction failures still produce `note_failed`. This setting must be a YAML boolean.

| Stage | Suggested label |
|---|---|
| `finalizing_transcript` | Finalizing transcript |
| `extracting_terms` | Finding clinical terms |
| `structuring_note` | Preparing note |
| `writing_note` | Generating SOAP note |
| `saving_note` | Saving note |

Consultation states are `ready`, `dictating`, `paused`, `processing`, `saved`, `signed` and `failed`. Success ends with `processing_stage: completed`. Failure ends with `processing_stage: failed` and `processing_error: note_failed`. There is no percentage or time estimate.

## SOAP note and green highlights

The note has four sections:

```json
{"subjective":"...","objective":"...","assessment":"...","plan":"..."}
```

After processing it may include:

```json
{"highlights":[{"section":"subjective","text":"chest pain","start":16,"end":26,"category":"medical_condition"}]}
```

Highlight positions belong to the SOAP section, not the transcript. `start` is included and `end` is excluded. Positions count Unicode characters; JavaScript can use `Array.from(sectionText)` to handle emoji correctly. Show these spans in green. Interim transcript text should use a separate faded style. Matching ignores case and small whitespace differences; it does not infer synonyms or new terms typed by the doctor.

Save edits with:

```json
{"note":{"subjective":"...","objective":"...","assessment":"...","plan":"..."}}
```

The server rebuilds highlights and returns the updated consultation. Treat missing highlights as an empty list.

## UI error states

HTTP errors return `{"code":"locked","message":"..."}`, replacing the old `detail` field. Codes include `invalid_credentials`, `unauthorized`, `session_expired`, `signup_failed`, `not_found`, `validation_error`, `invalid_state`, `locked`, `already_processing`, `connection_error` and `server_error`. `note_failed` is stored on a failed consultation. Provider details are kept out of responses.

- `401`: sign-in failed, token missing, invalid or expired.
- `400`: signup failed.
- `404`: patient, consultation, profile or note format not found.
- `422`: fields are invalid or missing. The body includes `fields`, a list of safe field names (for example `{"code":"validation_error","message":"Check the required fields and their values.","fields":["name","age"]}`). The frontend uses its own approved message table, never raw server copy.
- `409`: the action is blocked by the consultation state or processing has already started.
- WebSocket `1008` or `connection_error`: reconnect or show connection lost.
- `failed` / `note_failed`: keep the transcript and offer retry.
- Microphone and network errors: handle in the frontend.

The backend does not distinguish duplicate-account failures or browser microphone failures. Live connections are kept in one server process; use one worker. Processing jobs do not survive a server restart.

## Check contracts without a microphone

Open `/docs`. Signup with the fields above, then use **Authorize** with the returned access token. If email confirmation is required, confirm the email and login first.

1. Create a patient with `{"name":"Test Patient","age":58,"sex":"male"}`.
2. Create a consultation with `{"patient_id":"<returned patient id>"}`. It starts as `ready`.
3. Call pause: expect `409 invalid_state`. A successful pause needs an active WebSocket; Swagger does not open WebSockets. An external client can open one without sending audio, then call pause while the state is `dictating`.
4. Call sign while ready: expect `409 invalid_state`.
5. Save a manual SOAP note through PUT note, then sign: expect `200 signed`.
6. Try editing or deleting the signed consultation: expect `409 locked`.
7. Create another consultation and delete it: expect empty `204`; a later GET returns `404`.

### Verification on 2026-10-09

Revised Batch 2 validation: patient names and supplied profile name/specialty values must contain non-whitespace text and are trimmed. Optional patient age is a nonnegative integer or null; strings, fractions and booleans are rejected. Patient/consultation IDs in create/finish request bodies cannot be blank. Note input accepts text in the four SOAP sections; missing sections default to empty text, whitespace in clinical text is preserved, and client-supplied metadata/highlights are ignored. Section type errors identify the affected section in `fields`. The existing signed-note lock still applies. These rules were verified against the FastAPI application with isolated provider/database fixtures.

All 81 automated tests passed. Live API checks passed for signup, patient and consultation creation, doctor/patient links, patient summaries and creation time, manual note save, signing, signed locks, unsigned deletion and ready-state pause rejection. Temporary test records were removed.

The live successful-pause check remains blocked: `DEEPGRAM_API_KEY` is missing, so the WebSocket returns `connection_error`. Set a valid key in `backend/.env` and restart before checking live pause/resume. Automated tests cover successful pause and resume with a fake provider.

The running `/docs` page returned `200`, but browser automation failed before opening it. Live requests above were made directly to the same local backend, rather than through Swagger's buttons. Real microphone capture and AI note processing remain unverified.
