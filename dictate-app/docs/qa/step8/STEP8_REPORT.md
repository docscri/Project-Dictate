> Historical snapshot: this report records the Step 8 checks as they stood on 9 October 2026, before revised Batches 1 through 3. Some findings below were resolved later. For current status, use [BACKEND_GAPS.md](../../BACKEND_GAPS.md) and [FRONTEND_NOTES.md](../../FRONTEND_NOTES.md).

# Step 8 final pass - 9 October 2026

The frontend fixes and available checks are finished. **Step 8 is not accepted as complete**, because the real speech-to-note flow and its live/processing reload stages did not pass. Normal configuration remains `VITE_USE_MOCK=false`. Backend source and schema were not changed.

## Changes

- Fixed selected-consultation restoration on reload. The remembered ID is separated by account and mock/backend mode; the server still supplies the data.
- Added the Space pause/resume shortcut, polite transcript/status live regions, explicit error alerts, and focus rings for all focusable controls. Text fields and native buttons keep their normal Space behavior.
- Converted dismiss backdrops to buttons and kept consultation selection closing the compact drawer, including selecting the current consultation.
- Reduced motion stops waveform, cursor, pulses and pop-ins. Stage text uses a plain fade; progress values continue advancing.
- Darkened placeholder/error tokens and increased interim opacity from 45% to 50% to satisfy this step's contrast requirement. Ratios: placeholder/field 5.23:1, error/error background 4.80:1, muted/panel 6.47:1, ink-muted/paper 6.56:1, accent-ink/paper 5.62:1, large interim/paper 3.41:1.
- Fixed the corrupted Create account separator, added the missing regular serif font from Google Fonts under the existing OFL license, and restored normal weight for transcript/note body text.
- Matched the warning triangle, moved the existing Step n of 5 label beside the progress bar, and omitted an empty failed-note progress card when the last stage is unknown.
- Moved WebSocket and public-request path decisions into endpoints.js. Login and refresh explicitly opt out of recursive refresh; protected calls retain one refresh and one retry.

## 19 board reviews at 1440 × 900

Screenshots and contact sheets are in [screenshots](screenshots/). These are visual reviews with scripted sample states, not pixel-difference certification or real speech evidence. “Match” means the reviewed layout/state follows the board; approved earlier product changes and differences listed below remain.

| Board | Result | Detail |
|---|---|---|
| Add new patient | Match | Labels, tabs, sex choices, fields and primary action reviewed. |
| Create account | Fixed | Corrupted separator and placeholder contrast fixed. Existing Create account action and Back to Login retained. |
| Delete confirm | Match | Delete/Keep controls and paused transcript reviewed. |
| First use (empty list) | Match, with prior changes | Empty-list copy retained; no fabricated patient and Start stays disabled until a consultation exists. Canvas keeps the user's earlier Start dictation-only copy. |
| Listening | Fixed | Supplied image depicts the completed SOAP note, identical in purpose to Note ready. Normal note weight fixed; actual recording retains the live-transcript screen. |
| Login session ended | Match | Session-ended notice and layout reviewed. |
| Login wrong password | Fixed | Error contrast fixed. Entered credentials remain in the fields after rejection. |
| Login | Fixed | Placeholder contrast and keyboard focus fixed. |
| Microphone off | Fixed | Contrast/live-region/focus fixes; approved permission explanation retained. Screenshot timer is test data, not a reset requirement. |
| Note failed | Fixed | Empty unknown-stage progress card removed. A known last stage still appears, as required by Step 6. Sample patient differs. |
| Note ready | Fixed | Missing normal serif weight fixed; SOAP text stays inside its section. |
| Patient selected | Match | Selected row, solid Selected action and consultation action reviewed. |
| Paused | Fixed | Normal transcript weight, readable interim text and keyboard controls fixed. |
| Profile | Match, with prior changes | Earlier requested plain Back link retained instead of the PNG's outlined Back to dictation. |
| Ready | Match, with prior changes | Earlier requested Start dictation-only canvas copy retained. |
| Reconnecting | Fixed | Warning triangle, readable interim text and alert/live-region behavior fixed; transcript retained. |
| Search | Match | Search input, four sample rows and selection controls reviewed after results loaded. |
| Signed | Fixed | Normal note weight fixed. Real backend signing time is unavailable; fixture time is not backend evidence. |
| Writing note | Fixed | Step label now beside progress, stage fade under reduced motion, advancing progress confirmed. |

These results do not assert exact PNG equality. Accessible color/opacity changes intentionally differ from the supplied colors. Existing user-approved copy changes are preserved. Real data naturally changes patient names, times and sidebar rows.

## Keyboard and motion

PASS in desktop Microsoft Edge Chromium: Tab audits covered login, signup, Ready, profile, both patient popup tabs, Paused, delete confirmation, Microphone off, Reconnecting, Note ready, Signed and Note failed. Every reached control had a visible outline at least 2 px. Paper controls use accent-ink; dark controls use accent. No clickable div handlers remain for navigation/dismissal.

A separate keyboard-only journey operated login fields, password visibility, popup tabs/fields/sex/create, Start/Pause/Resume/Stop, live/note tabs, signing, profile department/save/Back, popup Escape and compact drawer selection. Escape returned focus to the opening New consultation button. Native Space on buttons did not double-toggle recording; Space in the transcript background paused/resumed; editing stayed usable.

PASS after reduced-motion browser emulation and reload: waveform and cursor animation names were none, rolling text had no movement/blur and used the plain fade, and progress advanced beyond step 3. No essential state relies on animation. This is browser emulation, not a separate physical OS test. No screen-reader announcement test was performed; live-region semantics were inspected.

## Real backend acceptance

Temporary accounts and records were created for these checks and removed afterward. Real UI calls used port 5173 and the backend at port 8000. Synthetic microphone input tested connection establishment only; it does not count as one minute of recognized speech.

| Check | Result | Evidence |
|---|---|---|
| 1. Full login → patient → consultation → one-minute dictation → pause/resume → note → edit/sign/lock | FAIL / blocked | Login, patient and consultation creation succeeded. The real stream returned connection_error before live words. A separately prepared manual note saved, reloaded, signed and rejected later edits with 409 locked. This does not satisfy the speech/AI requirement. |
| 2. Delete a second consultation | PASS | DELETE consultation returned 204 with an empty body, and the row left the sidebar. |
| 3. Reload at every stage | FAIL / partial | Ready, disconnected dictation → Ready, saved, signed and selecting an older consultation all survived reload correctly. Running dictation and sustained real AI processing could not be verified. |
| 4. Sign out/in, data retained | PASS | Real logout and login succeeded; the patient and exact signed note text remained. |

Failure request: `WS /api/dictation/stream/{test_id}?token=<redacted>`. This is a WebSocket event, not an HTTP error status. Body: `{"type":"error","code":"connection_error","message":"Audio connection lost. Please reconnect."}`. UI showed the approved reconnecting message. No server text appeared.

Fresh environment-file inspection found DEEPGRAM_API_KEY present, but the running real stream still failed. Its validity and the running process's loaded credential were not established. GEMINI_API_KEY, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are absent. No secret values were printed. Chrome is not installed and an iPhone Safari device is not available; the required one-minute Chrome/Safari tests remain outstanding.

Expected lock response: `PUT /api/consultations/{test_id}/note`, HTTP 409, `{"code":"locked","message":"This consultation is signed and locked."}`. UI mapped it to `This note is signed and can't be changed.` and stayed read-only.

One initial lock probe had no network response (mapped status 0, no response body); later independent runs returned the expected 409. The app's retry policy was not expanded. Two harness assumptions were corrected: identical patient rows must be distinguished by Ready/Signed state, and successful DELETE is 204 rather than 200.

The affected Step 7 real regression also passed: wrong-password 401 without refresh then correct login; concurrent protected 401s sharing one refresh; broken refresh → session-ended Login; actual 422 validation; stale signed-note 409 → read-only/autosave stopped; repeated pause 409 → one detail reconciliation; approved error copy without raw text. Live stream/restart checks remain blocked.

## Definition of done

- PASS: font names and hex values occur only in tokens.css; CSS uses shared tokens.
- PASS: API route literals occur only in endpoints.js.
- PASS: fetch occurs only in client.js. WebSocket is confined to shared/realtime, and microphone capture to shared/audio.
- PASS for covered errors: no raw server text, stack trace or JSON displayed.
- PASS: no OTP, forgot password, phone login, password change or citation controls; no Radiology/Surgery note formats. The department choices shown by the boards remain and use SOAP.
- PASS: production build, no browser errors in completed board/keyboard/real journeys.
- NOT COMPLETE: the required real speech-to-note flow and all-stage reload coverage.

## Remaining gaps

At that historical check, the provider connection had failed and Gemini/AWS settings had not been confirmed; untested one-minute Chrome/iPhone Safari speech; signup confirmation has no approved confirmation screen/copy; real signed response lacks a signing timestamp; failed response lacks a durable last successful stage; 422 lacked field names and the backend accepted a blank patient name at that time; revised Batch 2 later addressed both validation issues. Older provisional mock-shape notes remain historical; they are not proof of current failure. See the current [BACKEND_GAPS.md](../../BACKEND_GAPS.md) and [FRONTEND_NOTES.md](../../FRONTEND_NOTES.md).

No further step was started. Test-only mock preview was stopped; the normal real frontend/backend remain available.
