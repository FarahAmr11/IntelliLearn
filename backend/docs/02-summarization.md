### Summarization Model Logic

This document describes the summarizer’s logical pipeline (no API transport details).

1) Source Text Selection
- Prefers preexisting transcript (if present) over raw document text when applicable.
- Falls back to direct provided text. Empty/whitespace-only input short-circuits with an error upstream.

2) Normalization & Chunking
- Trims whitespace, collapses unusual spacing, and normalizes Unicode.
- For long inputs, splits into semantic chunks (e.g., paragraph or sentence grouping) respecting token limits.
- Optional overlap across chunks preserves context continuity.

3) Style/Mode Conditioning
- The `mode` parameter influences target length and density:
  - concise: brief abstract highlighting core points
  - detailed: longer explanation with secondary details
  - full: near-extractive condensation preserving most content
- The prompt/system instructions are adapted to reinforce the mode.

4) Model Inference
- Uses an instruction-tuned language model conditioned with: task guidance, mode hints, and chunk content.
- If chunked, runs inference per chunk and then performs a stitching pass to reconcile redundancy.

5) Stitching & Coherence Pass
- Merges chunk summaries; deduplicates repetitive points.
- Ensures section flow, fixes pronoun references, and aligns tense and voice.

6) Formatting & Cleanup
- Ensures readable paragraph structure; may convert bullet-style fragments into prose unless mode requests bullets.
- Applies minimal text normalization and safe length trimming.

7) Output Shape
- summary: final human-readable summary string
- raw: optional raw model payload or intermediate structures for debugging


