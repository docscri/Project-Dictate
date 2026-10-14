# Product

Dictate helps a doctor turn a consultation into a signed SOAP note.

The main journey is:

1. Sign in or create an account.
2. Search for an existing patient or create one.
3. Start a consultation from the microphone action.
4. Record dictation and show interim and final transcript text.
5. Pause, resume or finish the dictation.
6. Generate a SOAP note and show processing progress.
7. Review or edit the note, then sign and save it.

Consultations move through `ready`, `dictating`, `paused`, `processing`, `saved`, `signed` and `failed`. A signed consultation is read-only. Processing stages are `finalizing_transcript`, `extracting_terms`, `structuring_note`, `writing_note` and `saving_note`. A failed note keeps the transcript and exposes the last completed stage so the user can retry.

The note contains `subjective`, `objective`, `assessment` and `plan`. Clinical terms may be returned as green highlights with Unicode character offsets. The frontend must never display raw backend error text or provider details.

Use friendly frontend copy for errors:

- Invalid login: “Wrong email or password.”
- Expired session: “Your session ended. Please sign in again.”
- Note failure: “We could not write your note.” Keep the transcript and offer retry.
- Connection loss: “Connection lost. Reconnecting…” Keep transcript text already received.
- Locked consultation: “This note is signed and can’t be changed.”

The responsive dictation layout keeps the same structure on desktop, tablet and phone. The top bar contains the navigation controls and Live/Note tabs. The microphone is the primary action for starting a consultation. Expanded recording controls show the timer, delete, waveform, pause/resume and stop actions. Buttons and tabs must remain usable at narrow widths and preserve keyboard focus behavior.

The UI does not provide OTP login, phone login, forgot-password flows, unsigning, patient editing or multiple note formats. The current note format is SOAP. Live provider and physical-device microphone behavior require real credentials and device testing; mocked tests do not prove those integrations.
