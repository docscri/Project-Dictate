# Frontend notes

- The frontend defaults to the real backend. Use `VITE_USE_MOCK=true` only for a sample-data preview. Mock and backend sessions stay separate.
- Live speech needs a working Deepgram configuration. An Edge fixture test does not prove live speech works in Chrome or iPhone Safari; complete those checks when the provider is available.
- Physical iPhone Safari verification has not been completed in this workspace. Test microphone permission, retry, pause/resume and reconnect on an iPhone before claiming compatibility.
- Current code, accessibility and browser-fixture checks are summarized in [the Batch 3 report](qa/BATCH3_REPORT.md).
- Historical acceptance details and screenshots are in [QA reports](qa/).
