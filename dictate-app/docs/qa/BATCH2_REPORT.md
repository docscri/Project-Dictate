# Revised Batch 2: Reliable saving and data protection

Implemented on 9 October 2026. Scope: failed-save recovery, unsaved-edit reload protection, interrupted note-status recovery, bounded requests, cancelled searches and backend field validation. No provider keys were added or changed.

## Changes

1. **Save recovery.** A failed older write no longer prevents a queued newer edit from saving. Saves are serial for each consultation and account. Older responses preserve newer draft text. A failed unchanged version is not automatically retried; the existing Try again control explicitly saves it. Signing waits for the latest saved version and stops when saving fails.
2. **Reload protection.** The browser's standard leave-page warning appears while any note has unsaved text, including a consultation no longer selected. Dismissing it keeps the current page and draft; after a successful save, reload restores server data without a warning. Clinical draft text is not stored in localStorage.
3. **Status recovery.** A failed processing-status or completed-note detail request shows the existing error and Try again control. Retry resumes checking the same consultation, without another finish request. A server status of saved or signed triggers the detail fetch even if a completed stage label is absent. Dirty drafts are preserved during that handoff.
4. **Request limits and search.** Shared HTTP requests have a 15-second limit, including response-body reading and waiting for a shared token refresh. The existing single refresh/retry rule remains. Changing or closing a patient search aborts the previous transport and ignores its result. Cancellation adds no user-facing copy and does not clear the session.
5. **Validation.** Blank patient names, negative/non-integer ages, blank request IDs and supplied blank profile values return 422 before writing. SOAP section values must be text. Errors identify safe field names without echoing input or provider details. The frontend marks the failed note section or profile/registration field, including department choices.

## Verification

- Backend: 98 unittest tests passed, including eight new validation cases. Provider and database calls were isolated; these are real FastAPI route/schema tests, not live Supabase checks.
- Frontend: 26 Node tests passed, including save sequencing, failed explicit flush, account isolation, fetch/body/refresh time limits, cancellation and reload-warning conditions.
- Edge at 1440 x 900: six new browser scenarios passed against an isolated HTTP fixture with `VITE_USE_MOCK=false`: failed-save retry/no loop; newer draft retention; failed signing/reload warning/saved reload/lock; status/detail recovery without duplicate finish; section/department 422 borders; stale-search transport abort and safe error copy. No uncaught page errors.
- The existing eight Batch 1 browser scenarios passed again after the shared request changes.
- Production build, Python syntax compilation and backend dependency check passed.

### Reproduce

From `backend`: `.\.venv\Scripts\python.exe -m unittest discover -s tests` and `.\.venv\Scripts\python.exe -m pip check`.

From `frontend`: `npm test` and `npm run build`.

For browser fixtures, start an isolated Vite process on 5174 with `VITE_USE_MOCK=false` and `VITE_API_BASE_URL=http://127.0.0.1:8765`. Run `node tests/batch2-browser.cjs` and then `node tests/batch1-browser.cjs`; each script owns and closes its API fixture on 8765. Both use installed Microsoft Edge and an existing Playwright installation. Set `PLAYWRIGHT_MODULE` to its module directory if Playwright is not in the project's dependency tree. Do not run the fixture scripts simultaneously.

## Limits and remaining work

- The reload warning protects accidental navigation only. Choosing Leave, a browser crash, force-close or some mobile lifecycle events can lose unsaved text. Persistent offline draft storage is not part of this batch.
- A timed-out write may already have reached the server. Explicit retry sends the latest full SOAP note; no background retry loop is added. A shared refresh may complete for another caller after a waiting request times out.
- A timeout applies per request attempt; a successful refresh can lead to one new bounded retry. WebSocket streams retain their separate lifecycle.
- Live Supabase/speech/AI acceptance checks and Chrome/iPhone Safari verification remain in the key-dependent batches moved to the end. The six browser checks above use fixture responses and are not live-provider acceptance evidence.
- BACKEND_GAPS.md now marks the missing-field-name and blank-patient-name issues resolved. Its unrelated timestamp, last-processing-stage and live-provider gaps remain unchanged.
