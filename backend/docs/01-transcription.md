### Transcription Model Logic

This document describes the transcription model's logical pipeline (excluding any API or HTTP concerns).

1) Input Normalization
- Accepts either a Document reference (with file_path and mime_type) or a direct file path.
- Validates media type: audio/* or video/* preferred; non-media falls back to plain text handling.

2) Audio Loading & Preprocessing
- Loads media via a decoder to a mono, fixed sample rate waveform (e.g., 16kHz).
- Applies loudness normalization and voice-activity based trimming for long silent regions when enabled.
- Optionally splits long media into overlapping segments to respect model max-token/audio-length constraints.

3) Model Inference
- Uses a speech-to-text model (e.g., Whisper-like encoder-decoder) to produce token sequences per segment.
- Beam search/temperature sampling configured per model defaults for stable outputs.
- Produces per-segment timestamps when the backend/model provides alignment.

4) Language Detection
- If language is not provided, the model’s built-in language ID head infers the most probable locale code.
- The detected code is propagated as `language` in outputs and can be cached on the Document.

5) Post-processing
- Concatenates segment hypotheses into a single transcript string with whitespace and punctuation normalization.
- If timestamps are available, keeps a parallel `segments` list with text, start, and end times.
- Applies minimal text cleanup: collapsing repeated tokens, trimming filler artifacts, and removing obvious ASR artifacts.

6) Persistence Hooks
- When a Document is provided, persists the transcript to `document.text_content` and the detected `document.language`.

7) Output Shape
- transcription: final normalized transcript (string)
- text: alias of transcription for backward compatibility
- language: IETF-like language code if detected or provided
- segments: optional list of { start, end, text }
- raw: raw model output or debug payload for traceability


