### Translation Model Logic

This document outlines the translation pipeline logic (independent of any API wiring).

1) Source Text Resolution
- Prefers summarized text if present (for shorter, cleaner input), else transcript, else original text.
- If explicit source text is provided, it takes precedence.

2) Language Parameters
- target_lang is required; source_lang is optional.
- If source_lang is not provided, a language identification step estimates the input language for better decoding.

3) Normalization & Segmentation
- Normalizes whitespace, punctuation, and Unicode.
- Splits long input into sentence-like segments to respect model context limits.

4) Model Inference
- Uses a sequence-to-sequence or decoder-only translation-capable LLM conditioned on (source_lang, target_lang).
- Applies constraints to preserve named entities and numerals; discourages hallucination via instruction framing.

5) Post-Processing
- Reassembles segments with correct spacing and capitalization in the target language conventions.
- Performs heuristic fixes (e.g., quote/parentheses balance, locale-specific punctuation spacing).

6) Optional Back-Validation
- For quality, an optional back-translation check may be run on samples to detect drift from source meaning.

7) Output Shape
- translation: final translated text
- source_lang: detected or provided source language code
- target_lang: target language code
- raw: optional raw model payload for traceability


