# Backend gaps

- Live transcript streaming is now reported working by the user. The complete real-provider speech-to-note flow still needs verification.
- AWS Comprehend Medical returned an explicit organization service-control-policy deny for `DetectEntitiesV2`. `ai.ner_enabled` is now set to `false`, so note generation skips AWS and produces no clinical term highlights. Resolve the account restriction before re-enabling extraction; changing IAM permissions alone cannot override that deny.
- The configured Google AI Studio Gemma model still needs a live note-generation check, including its acceptance of the request settings and SOAP JSON response. Automated checks mock provider responses and do not prove live model compatibility.
- The signing response does not include a signed timestamp. The failed-processing response does not retain the last completed processing stage for display after reload.
- Apply migration 006, then check consultation-list and patient-search query plans against realistic data. It has not been applied or benchmarked against the live database.
- See [the backend contract](backend_contracts.md), [the Batch 3 report](qa/BATCH3_REPORT.md) and [historical Step 8 evidence](qa/step8/STEP8_REPORT.md).
