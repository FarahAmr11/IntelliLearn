# quiz_service.py
from __future__ import annotations

import os
import re
import json
import random
import logging
from dataclasses import dataclass, field
from typing import Any, List, Dict, Optional, Tuple

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# Optional spaCy for better candidate extraction
try:
    import spacy  # type: ignore
    SPACY_AVAILABLE = True
except Exception:
    SPACY_AVAILABLE = False

logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[%(levelname)s] %(asctime)s %(name)s: %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)

# ENV defaults: pick a QG model that expects "answer: ... context: ..." prompts
os.environ.setdefault("QUIZ_QG_MODEL", os.environ.get("QUIZ_MODEL", "mrm8488/t5-base-finetuned-question-generation-ap"))
os.environ.setdefault("QUIZ_DISTRACTOR_MODEL", os.environ.get("QUIZ_DISTRACTOR_MODEL", os.environ["QUIZ_QG_MODEL"]))
os.environ.setdefault("QUIZ_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
os.environ.setdefault("QUIZ_MAX_GEN_TOKENS", "256")
os.environ.setdefault("QUIZ_MAX_QUESTIONS", "12")


def _normalize_text(s: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def _short_tokens(s: str, limit: int = 8) -> Tuple[str, ...]:
    return tuple((s or "").lower().split()[:limit])


def _split_sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if s.strip()]


@dataclass
class QuizService:
    qg_model_name: str = field(default_factory=lambda: os.environ["QUIZ_QG_MODEL"])
    distractor_model_name: str = field(default_factory=lambda: os.environ["QUIZ_DISTRACTOR_MODEL"])
    device_str: str = field(default_factory=lambda: os.environ["QUIZ_DEVICE"])
    max_gen_tokens: int = field(default_factory=lambda: int(os.environ["QUIZ_MAX_GEN_TOKENS"]))
    default_num_questions: int = field(default_factory=lambda: int(os.environ["QUIZ_MAX_QUESTIONS"]))

    # internals
    _qg_tok: Any = field(default=None, init=False, repr=False)
    _qg_model: Any = field(default=None, init=False, repr=False)
    _d_tok: Any = field(default=None, init=False, repr=False)
    _d_model: Any = field(default=None, init=False, repr=False)
    _device: torch.device = field(init=False)

    def __post_init__(self):
        self._device = torch.device(self.device_str)
        logger.info("QuizService initializing: qg_model=%s distractor_model=%s device=%s", self.qg_model_name, self.distractor_model_name, self._device)
        # load QG tokenizer & model
        self._qg_tok = AutoTokenizer.from_pretrained(self.qg_model_name, use_fast=True)
        try:
            self._qg_model = AutoModelForSeq2SeqLM.from_pretrained(self.qg_model_name).to(self._device)
        except Exception:
            logger.exception("Failed to load QG model onto device %s, trying CPU.", self._device)
            self._qg_model = AutoModelForSeq2SeqLM.from_pretrained(self.qg_model_name)

        # load distractor model (may reuse QG model)
        if self.distractor_model_name and self.distractor_model_name != self.qg_model_name:
            self._d_tok = AutoTokenizer.from_pretrained(self.distractor_model_name, use_fast=True)
            try:
                self._d_model = AutoModelForSeq2SeqLM.from_pretrained(self.distractor_model_name).to(self._device)
            except Exception:
                logger.exception("Failed to load distractor model onto device %s, trying CPU.", self._device)
                self._d_model = AutoModelForSeq2SeqLM.from_pretrained(self.distractor_model_name)
        else:
            self._d_tok = self._qg_tok
            self._d_model = self._qg_model

        # load spaCy optionally (do once)
        if SPACY_AVAILABLE:
            try:
                # only load english if available
                _ = spacy.load("en_core_web_sm")
            except Exception:
                # may not be downloaded; ignore silently (we fallback to heuristics)
                logger.info("spaCy available but 'en_core_web_sm' not found; heuristics will be used instead.")

    # ---------------- helpers ----------------
    def _token_len(self, text: str, tokenizer: Any) -> int:
        try:
            return len(tokenizer.encode(text, add_special_tokens=False))
        except Exception:
            return len(text.split())

    def _truncate(self, text: str, max_tokens: int) -> str:
        try:
            ids = self._qg_tok.encode(text, add_special_tokens=False)
            if len(ids) <= max_tokens:
                return text
            ids = ids[:max_tokens]
            return self._qg_tok.decode(ids, skip_special_tokens=True, clean_up_tokenization_spaces=True)
        except Exception:
            return text[: max(1, max_tokens * 3)]

    def _extract_candidate_answers(self, text: str, limit: int = 40) -> List[Tuple[str, str]]:
        """
        Return list of (answer_text, context_sentence).
        Prefer named entities via spaCy when available; otherwise use heuristics.
        """
        sents = _split_sentences(text)
        candidates: List[Tuple[str, str]] = []

        if SPACY_AVAILABLE:
            try:
                nlp = spacy.load("en_core_web_sm")
                doc = nlp(text)
                # named entities first
                for ent in doc.ents:
                    sent = ent.sent.text if hasattr(ent, "sent") else (sents[0] if sents else text)
                    if ent.text and sent:
                        candidates.append((ent.text.strip(), sent.strip()))
                # noun chunks afterwards if still lacking
                if len(candidates) < limit:
                    seen = {a.lower() for a, _ in candidates}
                    for chunk in doc.noun_chunks:
                        ch = chunk.text.strip()
                        if ch and ch.lower() not in seen and len(ch.split()) <= 6:
                            sent = chunk.sent.text if hasattr(chunk, "sent") else (sents[0] if sents else text)
                            candidates.append((ch, sent.strip()))
                            seen.add(ch.lower())
                            if len(candidates) >= limit:
                                break
            except Exception:
                logger.exception("spaCy extraction failed; falling back to heuristic extraction.")
                SPACY_LOCAL = False  # fall back
        # heuristic fallback
        if not candidates:
            seen = set()
            for sent in sents:
                # find quoted phrases, caps phrases, and some keyword nouns
                quotes = re.findall(r"['\"“”‘’]([^'\"“”‘’]+)['\"“”‘’]", sent)
                for q in quotes:
                    if q and q.lower() not in seen:
                        candidates.append((q.strip(), sent))
                        seen.add(q.lower())
                caps = re.findall(r"\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b", sent)
                for c in caps:
                    if c and c.lower() not in seen and len(c.split()) <= 5:
                        candidates.append((c.strip(), sent))
                        seen.add(c.lower())
                # common keywords fallback (domain-specific)
                keywords = re.findall(r"\b(engine|revolution|transportation|urbanization|textile|factory|productivity|telegraph)\b", sent, flags=re.I)
                for k in keywords:
                    if k.lower() not in seen:
                        candidates.append((k.strip(), sent))
                        seen.add(k.lower())
                if len(candidates) >= limit:
                    break

        # dedupe preserving order
        out: List[Tuple[str, str]] = []
        seen = set()
        for a, ctx in candidates:
            key = _normalize_text(a)
            if key in seen:
                continue
            out.append((a, ctx))
            seen.add(key)
            if len(out) >= limit:
                break
        return out

    def _qg_generate_question(self, answer: str, context: str, max_new_tokens: int = 64) -> Tuple[str, Optional[str]]:
        """
        Use the QG model with "answer: ...  context: ..." prompt.
        Returns (question_text, raw_model_text)
        """
        prompt = f"answer: {answer}  context: {context} </s>"
        inputs = self._qg_tok(prompt, return_tensors="pt", truncation=True, max_length=min(self._qg_tok.model_max_length, 1024))
        input_ids = inputs["input_ids"].to(self._device)
        attention_mask = inputs.get("attention_mask")
        gen_kwargs = dict(input_ids=input_ids, attention_mask=attention_mask, max_new_tokens=max_new_tokens, num_beams=4, early_stopping=True)
        with torch.no_grad():
            out_ids = self._qg_model.generate(**gen_kwargs)
        q = self._qg_tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)
        return q.strip(), (out_ids.cpu().tolist() if hasattr(out_ids, "cpu") else None)

    def _generate_distractors(
        self,
        answer: str,
        context: str,
        other_candidates: List[str],
        top_k: int = 3
    ) -> List[str]:
        """
        Try model-based distractor generation then filter + prefer other_candidates.
        """
        # try model generation
        prompt = (
            f"Given the correct answer: '{answer}' in the context: {context}\n"
            "Generate 6 plausible incorrect but related short answer options (comma-separated)."
        )
        cleaned: List[str] = []
        try:
            inputs = self._d_tok(prompt, return_tensors="pt", truncation=True, max_length=min(self._d_tok.model_max_length, 1024))
            input_ids = inputs["input_ids"].to(self._device)
            attention_mask = inputs.get("attention_mask")
            gen_kwargs = dict(input_ids=input_ids, attention_mask=attention_mask, max_new_tokens=80, num_beams=4, early_stopping=True)
            with torch.no_grad():
                out_ids = self._d_model.generate(**gen_kwargs)
            raw = self._d_tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)
            parts = re.split(r"\n|,|;|\||\t", raw)
            parts = [p.strip().strip('"\'' ) for p in parts if p.strip()]
        except Exception:
            parts = []

        # normalize & filter duplicates / too-similar / trivial answers
        ans_norm = _normalize_text(answer)
        def too_similar(a: str, b: str) -> bool:
            return _normalize_text(a) == _normalize_text(b) or _short_tokens(_normalize_text(a)) == _short_tokens(_normalize_text(b))

        for p in parts:
            if len(cleaned) >= top_k * 2:
                break
            if not p:
                continue
            if _normalize_text(p) == ans_norm:
                continue
            if _normalize_text(p) in ("none of the above", "n/a", "na", "unknown"):
                continue
            if len(p) < 2 or len(p.split()) > 8:
                continue
            if any(too_similar(p, ex) for ex in cleaned):
                continue
            cleaned.append(p)

        # prefer pulling distractors from other_candidates if we still need
        for cand in other_candidates:
            if len(cleaned) >= top_k:
                break
            if _normalize_text(cand) == ans_norm:
                continue
            if any(too_similar(cand, ex) for ex in cleaned):
                continue
            if len(cand.split()) > 8:
                continue
            cleaned.append(cand)

        # final fallback perturbations (ensure uniqueness)
        i = 0
        while len(cleaned) < top_k and i < 12:
            i += 1
            words = answer.split()
            if len(words) > 1:
                cand = " ".join(random.sample(words, len(words)))
            else:
                cand = answer + random.choice(["s", "es", "er", " (alt)"])
            if _normalize_text(cand) == ans_norm:
                continue
            if any(_normalize_text(cand) == _normalize_text(ex) for ex in cleaned):
                continue
            cleaned.append(cand)

        return cleaned[:top_k]

    # ---------------- public API ----------------
    def generate_quiz(self, text: str, num_questions: Optional[int] = None, difficulty: str = "medium") -> Dict[str, Any]:
        """
        Generate `num_questions` MCQs from `text`.
        Returns dict: { "questions": [{prompt, options, answer_index, answer_text, context}], "raw": {...} }
        """
        if not text or not text.strip():
            return {"questions": [], "raw": ""}

        n = int(num_questions or self.default_num_questions)
        n = max(1, min(50, n))

        # Preprocess/truncate text to reasonable size for generation
        total_tokens = self._token_len(text, self._qg_tok)
        # limit to 2000 tokens of context (heuristic)
        keep_tokens = min(total_tokens, 2000)
        working_text = self._truncate(text, keep_tokens)

        # extract candidate answers
        candidates = self._extract_candidate_answers(working_text, limit=80)
        candidate_pool = [a for a, _ in candidates]
        logger.info("QuizService: extracted %d candidate answers", len(candidate_pool))

        questions: List[Dict[str, Any]] = []
        raw_model_outputs: Dict[str, Any] = {"qg_raw": [], "distractor_raw": []}
        used_answers = set()

        for answer, context in candidates:
            if len(questions) >= n:
                break
            ans_norm = _normalize_text(answer)
            if ans_norm in used_answers:
                continue

            try:
                # generate question (QG)
                q_text, q_raw = self._qg_generate_question(answer, context, max_new_tokens=min(128, self.max_gen_tokens))
                q_text = re.sub(r"^[Qq]uestion[:\s]*", "", q_text).strip()
                raw_model_outputs["qg_raw"].append({"answer": answer, "context": context, "raw": q_raw})
                if not q_text or len(q_text) < 6 or len(q_text.split()) < 3:
                    # skip too-short/invalid outputs
                    continue

                # generate distractors (filtered)
                other_cands = [c for c in candidate_pool if _normalize_text(c) != ans_norm]
                distractors = self._generate_distractors(answer, context, other_cands, top_k=3)
                raw_model_outputs["distractor_raw"].append({"answer": answer, "distractors_candidate_count": len(distractors)})

                # assemble options: answer + distractors -> unique
                opts = [answer] + [d for d in distractors if _normalize_text(d) != ans_norm]
                # dedupe by normalized form preserving order
                seen = set()
                final_opts: List[str] = []
                for o in opts:
                    key = _normalize_text(o)
                    if key in seen:
                        continue
                    seen.add(key)
                    final_opts.append(o)
                    if len(final_opts) >= 4:
                        break

                # fill from other candidates if needed
                for cand in other_cands:
                    if len(final_opts) >= 4:
                        break
                    kn = _normalize_text(cand)
                    if kn in seen or len(cand.split()) > 8:
                        continue
                    final_opts.append(cand)
                    seen.add(kn)

                # final synthetic fill
                i = 0
                while len(final_opts) < 4 and i < 12:
                    i += 1
                    cand = answer + f" ({i})"
                    kn = _normalize_text(cand)
                    if kn in seen:
                        continue
                    final_opts.append(cand)
                    seen.add(kn)

                # ensure unique normalized strings (append suffix if necessary)
                for idx, o in enumerate(final_opts):
                    base = o
                    j = 1
                    while sum(1 for x in final_opts if _normalize_text(x) == _normalize_text(base)) > 1:
                        final_opts[idx] = f"{base} ({j})"
                        j += 1

                # ensure correct answer present (by normalized match)
                correct_text = answer
                if not any(_normalize_text(opt) == _normalize_text(correct_text) for opt in final_opts):
                    # make sure to include correct answer
                    final_opts = [correct_text] + final_opts[:3]

                # shuffle and determine correct index
                random.shuffle(final_opts)
                correct_index = next((i for i, o in enumerate(final_opts) if _normalize_text(o) == _normalize_text(correct_text)), 0)

                # final question structure
                qobj = {
                    "prompt": q_text,
                    "options": final_opts,
                    "answer_index": correct_index,
                    "answer_text": correct_text,
                    "context": context,
                    "difficulty": difficulty,
                }
                questions.append(qobj)
                used_answers.add(ans_norm)
                logger.info("Generated question for answer='%s' (options=%s)", answer, final_opts)
            except Exception as exc:
                logger.exception("Error generating question for answer=%s: %s", answer, exc)
                continue

        return {"questions": questions, "raw": raw_model_outputs}
