### Quiz Generation Model Logic

This document details the quiz generation pipeline logic from source text to structured questions.

1) Source Text Policy
- Uses provided text when available; otherwise pulls from document summary (preferred) or raw text.
- Normalizes spacing and removes boilerplate to reduce distractors.

2) Difficulty & Structure Conditioning
- The `difficulty` setting influences question abstraction and distractor subtlety (e.g., easy → factual; hard → conceptual).
- Targets a mixture of multiple-choice items with 1 correct answer and plausible distractors.

3) Topic Segmentation
- Splits long text into thematic segments to increase topical coverage.
- Ensures each segment yields at most a few questions to balance breadth and depth.

4) Prompting Strategy
- The model is instructed to:
  - extract key facts/relations for stems
  - avoid ambiguous wording
  - create distractors that are close but clearly incorrect upon careful reading
  - include brief explanations when available

5) Model Inference
- An instruction-tuned LLM produces a structured object per question: { prompt, options[], answer_index, explanation? }.
- Sampling temperature and nucleus parameters are tuned to maintain variety without encouraging hallucination.

6) Validation & Cleanup
- Post-validates that one and only one correct answer exists.
- Deduplicates near-identical options and trims long stems.
- Ensures options are mutually exclusive and parallel in form.

7) Output Shape
- questions: ordered list of items with fields { prompt, options[], answer_index, explanation }
- raw: optional raw model payload for auditing


