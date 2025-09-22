### FlashNotes Model Logic

This document captures the note-generation pipeline logic used to produce concise study notes from input text.

1) Source Text Strategy
- Prefers explicit text if provided; otherwise uses document summary when available (to reduce noise), else raw text.

2) Density Control
- `density` guides depth of coverage:
  - skim: headline-like bullets, minimal detail
  - study: balanced bullets with brief explanations
  - exam: denser bullets, definitions, and cause–effect relationships

3) Chunking for Multiple Notes
- When producing multiple notes, text is chunked by token length with small overlaps.
- Each chunk yields an independent note to improve coverage and topical diversity.

4) Prompting & Structure
- The model is instructed to output structured markdown-like content:
  - An optional `### Notes` header
  - Bulleted key takeaways
  - Short, readable clauses; avoid redundancy

5) Model Inference
- Uses an instruction-following LLM prompted with: role guidance, density setting, and the chunk text.
- The model is encouraged to extract salient facts, definitions, and relationships rather than paraphrasing wholesale.

6) Post-Processing
- Light normalization of bullets and headings; fixes duplicate bullets and trivial noise.
- Ensures the resulting content fits a note card format (compact and scannable).

7) Output Shape
- content: markdown-like string with headings and bullets
- title: generated or templated based on source
- source_snippet: short excerpt of source text for context
- tags/meta: density and provenance information


