# notes_service_improved.py
from __future__ import annotations

import math
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# ---------- Config / env defaults ----------
os.environ.setdefault("NOTES_MODEL", "google/flan-t5-large")
os.environ.setdefault("NOTES_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
os.environ.setdefault("NOTES_SHORT_MAX_TOKENS", "1024")
os.environ.setdefault("NOTES_MIN_TOKENS", "48")
os.environ.setdefault("NOTES_MAX_TOKENS", "900")
os.environ.setdefault("NOTES_CHUNK_OVERLAP", "256")

# ---------- Logging ----------
logger = logging.getLogger("notes")
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[%(levelname)s] %(asctime)s %(name)s: %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)


DENSITY_PRESETS = {
    "skim":  {"min": 120, "max": 220, "sections": 3, "bullets": 6},
    "study": {"min": 280, "max": 420, "sections": 4, "bullets": 10},
    "exam":  {"min": 600, "max": 900, "sections": 6, "bullets": 16},
}


def _split_sentences(text: str) -> List[str]:
    sents = re.findall(r"[^.!?]+[.!?]?", text)
    return [s.strip() for s in sents if s and s.strip()]


def _tokenize_words(s: str) -> List[str]:
    return re.findall(r"\b\w+\b", s.lower())


def _extractive_select(text: str, top_k: int = 200) -> str:
    sents = _split_sentences(text)
    if not sents:
        return text
    docs_tokens = [ _tokenize_words(s) for s in sents ]
    df = {}
    for toks in docs_tokens:
        seen = set()
        for t in toks:
            if t in seen:
                continue
            seen.add(t)
            df[t] = df.get(t, 0) + 1
    N = len(docs_tokens)
    scores = []
    for toks in docs_tokens:
        tf = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for t, f in tf.items():
            idf = math.log(1.0 + (N / (1 + df.get(t, 0))))
            score += f * idf
        length_norm = max(1, len(toks))
        scores.append(score / length_norm)
    k = min(top_k, len(sents))
    ranked_idx = sorted(range(len(sents)), key=lambda i: scores[i], reverse=True)[:k]
    ranked_idx_set = set(ranked_idx)
    selected = [sents[i] for i in range(len(sents)) if i in ranked_idx_set]
    return " ".join(selected)


def _clean_source_text(text: str) -> str:
    # normalize whitespace and quotes, remove weird non-text glyphs from OCR
    if not text:
        return text
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    # replace fancy quotes and dashes
    t = t.replace("“", '"').replace("”", '"').replace("’", "'").replace("—", "-").replace("–", "-")
    # normalize multiple newlines
    t = re.sub(r"\n{2,}", "\n\n", t)
    # remove weird unicode control chars
    t = re.sub(r"[\u0000-\u001f\u007f-\u009f]", " ", t)
    # collapse repeated punctuation
    t = re.sub(r"([!?]){2,}", r"\1", t)
    # collapse multiple spaces
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


@dataclass
class NotesService:
    model_name: str = field(default_factory=lambda: os.environ["NOTES_MODEL"])
    device_str: str = field(default_factory=lambda: os.environ["NOTES_DEVICE"])
    short_max_tokens: int = field(default_factory=lambda: int(os.environ["NOTES_SHORT_MAX_TOKENS"]))
    min_tokens: int = field(default_factory=lambda: int(os.environ["NOTES_MIN_TOKENS"]))
    max_tokens_cap: int = field(default_factory=lambda: int(os.environ["NOTES_MAX_TOKENS"]))
    chunk_overlap: int = field(default_factory=lambda: int(os.environ["NOTES_CHUNK_OVERLAP"]))

    _device: torch.device = field(init=False)
    _tok: Any = field(default=None, init=False, repr=False)
    _model: Any = field(default=None, init=False, repr=False)

    # prompt templates
    instruction_template: str = field(init=False, default=(
        "You are an expert study-notes generator. From the source text produce a clear Markdown outline "
        "with short ### section headings and bullet points (-). Prioritize facts, definitions, causes/effects, dates, formulas, and examples. "
        "Avoid verbatim copy; compress long passages into concise bullets. End with a 'Key Takeaways' section (3-5 bullets)."
    ))
    polish_template: str = field(init=False, default=(
        "Polish and merge the partial notes below into a clean, de-duplicated Markdown outline with proper sections and bullets. "
        "Keep facts, remove repetition, and make bullets compact."
    ))

    def __post_init__(self):
        self._device = torch.device(self.device_str)
        logger.info("NotesService loading model=%s device=%s", self.model_name, self._device)
        t0 = time.time()
        self._tok = AutoTokenizer.from_pretrained(self.model_name, use_fast=True)
        try:
            self._model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name).to(self._device)
        except Exception as e:
            logger.warning("Could not move model to %s: %s. Loading on CPU fallback.", self._device, e)
            self._model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)
        logger.info("Loaded model in %.2fs", time.time() - t0)

        # quick self-test
        try:
            test_src = "The quick brown fox jumps over the lazy dog. This is a quick health check."
            out = self._generate_notes_from_text(test_src, density="skim", dry_run=True)
            logger.info("NotesService self-test OK preview: %s", out[:200].replace("\n"," "))
        except Exception:
            logger.exception("NotesService self-test failed.")


    # ---------- helpers ----------
    def _token_len(self, text: str) -> int:
        try:
            return len(self._tok.encode(text, add_special_tokens=False))
        except Exception:
            return len(text.split())

    def _chunk_by_token_ids(self, text: str, max_tokens: int, overlap: Optional[int] = None) -> List[str]:
        if overlap is None:
            overlap = self.chunk_overlap
        ids = self._tok.encode(text, add_special_tokens=False)
        if len(ids) <= max_tokens:
            return [text]
        chunks = []
        step = max_tokens - overlap
        if step <= 0:
            step = max_tokens // 2
        for i in range(0, len(ids), step):
            chunk_ids = ids[i:i+max_tokens]
            chunk_text = self._tok.decode(chunk_ids, skip_special_tokens=True, clean_up_tokenization_spaces=True)
            chunks.append(chunk_text.strip())
        return chunks

    def _generate(
        self,
        prompt_text: str,
        truncation_max_length: Optional[int],
        max_new_tokens: int,
        min_length: int,
        num_beams: int = 4,
        no_repeat_ngram_size: int = 3,
        length_penalty: float = 0.9,
        do_sample: bool = False,
        temperature: float = 1.0,
        top_p: float = 0.95,
    ) -> str:
        inputs = self._tok(prompt_text, return_tensors="pt", truncation=True, max_length=truncation_max_length)
        input_ids = inputs["input_ids"]
        attention_mask = inputs.get("attention_mask", None)
        try:
            dev = next(self._model.parameters()).device
            input_ids = input_ids.to(dev)
            if attention_mask is not None:
                attention_mask = attention_mask.to(dev)
        except Exception:
            pass

        gen_kwargs = dict(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=max_new_tokens,
            min_length=min_length,
            num_beams=num_beams if not do_sample else 1,  # sampling cannot be combined with beams
            no_repeat_ngram_size=no_repeat_ngram_size,
            length_penalty=length_penalty,
            early_stopping=True,
            do_sample=do_sample,
        )
        # sampling-specific params
        if do_sample:
            gen_kwargs.update({"temperature": temperature, "top_p": top_p})

        with torch.no_grad():
            out_ids = self._model.generate(**gen_kwargs)
        txt = self._tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)
        txt = "\n".join(line.strip() for line in txt.splitlines() if line.strip())
        return txt

    def _adaptive_budget(self, total_tokens: int, preset_min: int, preset_max: int) -> int:
        k = 3.0
        est = int(k * math.sqrt(max(1, total_tokens)))
        est = max(preset_min, min(preset_max, est))
        return min(est, self.max_tokens_cap)

    def _validate_and_repair(self, generated: str, source: str, min_bullets: int = 3) -> str:
        # ensure presence of headings and bullets; if missing, convert sentences into bullets
        if not generated:
            return ""
        has_heading = bool(re.search(r"^#{1,3}\s+", generated, flags=re.M))
        has_bullets = bool(re.search(r"^\s*[-*]\s+", generated, flags=re.M))
        # avoid echo: if generated is nearly identical to source, return empty to trigger retry
        sim = self._similarity_ratio(source[:2000], generated[:2000])
        if sim > 0.85:
            logger.warning("Generated notes too similar to source (sim=%.2f).", sim)
            return ""
        if has_heading and has_bullets:
            return generated
        # Repair: build simple markdown bullets from first sentences
        sents = _split_sentences(generated or source)
        bullets = sents[: max(min_bullets, min(12, len(sents)))]
        md = "### Notes\n" + "\n".join([f"- {b.strip()}" for b in bullets])
        return md

    def _similarity_ratio(self, a: str, b: str) -> float:
        # simple Jaccard-ish overlap on words for quick check
        if not a or not b:
            return 0.0
        wa = set(_tokenize_words(a))
        wb = set(_tokenize_words(b))
        if not wa or not wb:
            return 0.0
        inter = len(wa & wb)
        uni = len(wa | wb)
        return inter / uni if uni > 0 else 0.0

    # ---------- public API ----------
    def make_notes(self, text: str, density: str = "study", *, multi_variant: bool = False, variants: int = 1) -> List[str] | str:
        """
        If multi_variant=True or variants>1, return a list of independent notes (strings).
        Otherwise return a single markdown string.
        density: 'skim'|'study'|'exam'
        """
        if not text or not text.strip():
            return "- [empty source]"

        density = (density or "study").lower()
        preset = DENSITY_PRESETS.get(density, DENSITY_PRESETS["study"])
        desired_min, desired_max = preset["min"], preset["max"]

        cleaned = _clean_source_text(text)
        total_tokens = self._token_len(cleaned)
        logger.info("make_notes tokens=%d density=%s", total_tokens, density)

        # very long -> extractive preselection
        long_threshold = max(self.short_max_tokens * 2, 2500)
        used_text = cleaned
        if total_tokens > long_threshold:
            logger.info("Very long input (%d tokens). Running extractive preselection.", total_tokens)
            top_k = min(400, max(60, int(math.sqrt(total_tokens) * 3)))
            used_text = _extractive_select(cleaned, top_k=top_k)
            total_tokens = self._token_len(used_text)
            logger.info("Extractive preselect tokens=%d chars=%d", total_tokens, len(used_text))

        short_cap = max(128, self.short_max_tokens - 64)
        budget = self._adaptive_budget(total_tokens, desired_min, desired_max)

        # If multiple independent notes requested: split into distinct chunks (token-aware)
        if multi_variant or variants > 1:
            n = max(1, variants)
            chunks = self._chunk_by_token_ids(used_text, max_tokens=max(short_cap, short_cap // n + 64), overlap=64)
            # ensure at least n chunks by sliding window fallback
            if len(chunks) < n:
                # naive sentence-split fallback
                sents = _split_sentences(used_text)
                avg = max(1, len(sents) // n)
                chunks = [" ".join(sents[i*avg:(i+1)*avg]) for i in range(n)]
            chunks = chunks[:n]
            notes: List[str] = [""] * len(chunks)
            max_workers = min(8, max(1, len(chunks)))
            per_chunk_budget = max(self.min_tokens, budget // max(1, len(chunks)))

            def _gen_one(idx: int, chunk: str) -> tuple[int, str]:
                generated = self._generate(
                    prompt_text=f"{self.instruction_template}\n\nSource:\n{chunk}\n\nNotes:",
                    truncation_max_length=self.short_max_tokens,
                    max_new_tokens=per_chunk_budget,
                    min_length=max(self.min_tokens, per_chunk_budget // 4),
                    num_beams=4,
                    no_repeat_ngram_size=3,
                    length_penalty=0.9,
                    do_sample=True,
                    temperature=0.9,
                    top_p=0.92,
                )
                repaired = self._validate_and_repair(generated, chunk)
                if not repaired:
                    generated = self._generate(
                        prompt_text=("You are an expert summarizer. Produce compact bullet notes (Markdown). "
                                     "Keep headings and bullets only.\n\nSource:\n" + chunk + "\n\nNotes:"),
                        truncation_max_length=self.short_max_tokens,
                        max_new_tokens=per_chunk_budget,
                        min_length=max(self.min_tokens, 32),
                        num_beams=6,
                        no_repeat_ngram_size=3,
                        length_penalty=0.85,
                        do_sample=False,
                    )
                    repaired = self._validate_and_repair(generated, chunk)
                if not repaired:
                    sents = _split_sentences(chunk)
                    repaired = "### Notes\n" + "\n".join([f"- {s.strip()}" for s in sents[:max(3, min(12, len(sents)))]])
                return idx, repaired

            with ThreadPoolExecutor(max_workers=max_workers) as ex:
                futures = [ex.submit(_gen_one, i, chunk) for i, chunk in enumerate(chunks)]
                for fut in as_completed(futures):
                    i, note = fut.result()
                    notes[i] = note
            return notes

        # Single note path
        prompt = f"{self.instruction_template}\n\nSource:\n{used_text}\n\nNotes:"
        generated = self._generate(
            prompt_text=prompt,
            truncation_max_length=self.short_max_tokens,
            max_new_tokens=budget,
            min_length=max(self.min_tokens, budget // 4),
            num_beams=6,
            no_repeat_ngram_size=3,
            length_penalty=0.9,
            do_sample=False,
        )

        final = self._validate_and_repair(generated, used_text)
        if not final:
            # retry with more explicit polish prompt
            logger.info("Primary notes generation unsatisfactory; retrying with polish prompt.")
            generated = self._generate(
                prompt_text=self.polish_template + "\n\nPartial notes:\n" + (generated or used_text),
                truncation_max_length=self.short_max_tokens,
                max_new_tokens=min(self.max_tokens_cap, max(self.min_tokens, budget)),
                min_length=max(self.min_tokens, 64),
                num_beams=6,
                no_repeat_ngram_size=3,
                length_penalty=0.85,
                do_sample=False,
            )
            final = self._validate_and_repair(generated, used_text)

        if not final:
            # last-resort, produce extractive bullets
            sents = _split_sentences(used_text)
            final = "### Notes\n" + "\n".join([f"- {s.strip()}" for s in sents[:max(5, min(16, len(sents)))]])

        return final

    def _generate_notes_from_text(self, text: str, density: str = "skim", dry_run: bool = False) -> str:
        if dry_run:
            preset = DENSITY_PRESETS.get((density or "skim"), DENSITY_PRESETS["skim"])
            cleaned = " ".join(text.split())
            budget = max(32, preset["min"] // 2)
            prompt = "Produce a short 2-bullet note:\n\nSource:\n" + cleaned + "\n\nNotes:\n"
            return self._generate(prompt, truncation_max_length=self.short_max_tokens, max_new_tokens=budget, min_length=8, num_beams=2)
        return self.make_notes(text, density=density)
