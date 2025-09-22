# summarizer_service_retry_led.py
from __future__ import annotations

import os
import math
import logging
import re
from dataclasses import dataclass, field
from typing import Any, List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

# optional extractive selection
try:
    from sentence_transformers import SentenceTransformer, util as st_util
    S2_AVAILABLE = True
except Exception:
    S2_AVAILABLE = False

logger = logging.getLogger(__name__)
if not logger.handlers:
    h = logging.StreamHandler()
    h.setFormatter(logging.Formatter("[%(levelname)s] %(asctime)s %(name)s: %(message)s"))
    logger.addHandler(h)
logger.setLevel(logging.INFO)

# env defaults (override externally as needed)
os.environ.setdefault("SUMMARIZER_MODEL_SHORT", "google/flan-t5-large")
os.environ.setdefault("SUMMARIZER_MODEL_LONG", "allenai/led-large-16384")
os.environ.setdefault("SUMMARIZER_SHORT_MAX_TOKENS", "1024")
os.environ.setdefault("SUMMARIZER_LONG_MAX_TOKENS", "16384")
os.environ.setdefault("SUMMARY_MIN_TOKENS", "32")
os.environ.setdefault("SUMMARY_MAX_TOKENS", "1024")
os.environ.setdefault("SUMMARY_LONG_CHUNK_OVERLAP", "256")
os.environ.setdefault("SUMMARY_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")

@dataclass
class SummaryService:
    _short_tok: Any = field(default=None, init=False, repr=False)
    _short_model: Any = field(default=None, init=False, repr=False)
    _long_tok: Any = field(default=None, init=False, repr=False)
    _long_model: Any = field(default=None, init=False, repr=False)

    short_name: str = field(default_factory=lambda: os.environ["SUMMARIZER_MODEL_SHORT"])
    long_name: str = field(default_factory=lambda: os.environ["SUMMARIZER_MODEL_LONG"])
    short_max_tokens: int = field(default_factory=lambda: int(os.environ["SUMMARIZER_SHORT_MAX_TOKENS"]))
    long_max_tokens: int = field(default_factory=lambda: int(os.environ["SUMMARIZER_LONG_MAX_TOKENS"]))
    min_summary_tokens: int = field(default_factory=lambda: int(os.environ["SUMMARY_MIN_TOKENS"]))
    max_summary_tokens_cap: int = field(default_factory=lambda: int(os.environ["SUMMARY_MAX_TOKENS"]))
    chunk_overlap: int = field(default_factory=lambda: int(os.environ["SUMMARY_LONG_CHUNK_OVERLAP"]))
    device_str: str = field(default_factory=lambda: os.environ["SUMMARY_DEVICE"])

    _device: torch.device = field(init=False)

    def __post_init__(self):
        self._device = torch.device(self.device_str if isinstance(self.device_str, str) else "cpu")
        logger.info("SummaryService device=%s short=%s long=%s", self._device, self.short_name, self.long_name)

        # load short
        logger.info("Loading short model/tokenizer: %s", self.short_name)
        self._short_tok = AutoTokenizer.from_pretrained(self.short_name, use_fast=True)
        self._short_model = AutoModelForSeq2SeqLM.from_pretrained(self.short_name)
        try:
            self._short_model.to(self._device)
        except Exception:
            logger.warning("Could not move short model to device %s", self._device)

        # load long (best-effort)
        try:
            logger.info("Loading long model/tokenizer: %s", self.long_name)
            self._long_tok = AutoTokenizer.from_pretrained(self.long_name, use_fast=True)
            self._long_model = AutoModelForSeq2SeqLM.from_pretrained(self.long_name)
            try:
                self._long_model.to(self._device)
            except Exception:
                logger.warning("Could not move long model to device %s", self._device)
        except Exception as e:
            logger.warning("Failed to load long model %s: %s", self.long_name, e)
            self._long_tok = None
            self._long_model = None

        # optional sentence-transformer initialisation deferred to runtime

        # quick self-test (short model)
        try:
            self._self_test_short_model()
        except Exception as e:
            logger.warning("Short model self-test failed: %s", e)

    # ---------------- util & cleaning ----------------
    def _clean_source(self, text: str) -> str:
        if not text:
            return ""
        s = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
        s = re.sub(r"[\x00-\x1F\x7F]+", " ", s)
        s = re.sub(r"-\s*\n\s*", "", s)
        s = re.sub(r"\r\n?", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()

    def _token_len(self, text: str, tokenizer: Any) -> int:
        try:
            return len(tokenizer.encode(text, add_special_tokens=False))
        except Exception:
            return len(text.split())

    def _split_sentences(self, text: str) -> List[str]:
        if not text:
            return []
        sents = re.split(r'(?<=[\.\?\!])\s+', text)
        return [s.strip() for s in sents if s and s.strip()]

    def _extract_topk_sentences(self, text: str, top_k: int = 40) -> str:
        sents = self._split_sentences(text)
        if not sents:
            return text
        if S2_AVAILABLE:
            try:
                model = SentenceTransformer("all-MiniLM-L6-v2")
                doc_emb = model.encode(" ".join(sents), convert_to_tensor=True)
                sent_embs = model.encode(sents, convert_to_tensor=True)
                scores = st_util.pytorch_cos_sim(sent_embs, doc_emb).squeeze(1).cpu().tolist()
                top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:min(top_k, len(sents))]
                top_idx_sorted = sorted(top_idx)
                return " ".join(sents[i] for i in top_idx_sorted)
            except Exception as e:
                logger.debug("extractive selection failed: %s", e)
        # fallback
        return " ".join(sents[:min(top_k, len(sents))])

    def _chunk_sentences_by_tokens(self, text: str, tokenizer: Any, max_tokens: int, overlap: Optional[int] = None) -> List[str]:
        if overlap is None:
            overlap = self.chunk_overlap
        sents = self._split_sentences(text)
        if not sents:
            return [text]
        chunks = []
        cur = []
        cur_t = 0
        for s in sents:
            t = self._token_len(s, tokenizer)
            if cur and cur_t + t > max_tokens:
                chunks.append(" ".join(cur).strip())
                # keep last sentence for overlap
                if overlap > 0:
                    cur = cur[-1:]
                    cur_t = sum(self._token_len(x, tokenizer) for x in cur)
                else:
                    cur = []
                    cur_t = 0
            cur.append(s)
            cur_t += t
        if cur:
            chunks.append(" ".join(cur).strip())
        return chunks

    # ---------------- LED helper ----------------
    def _is_led_model(self, model: Any, model_name: str) -> bool:
        # heuristics: model class name or model string contains 'led' or 'longformer' or 'led'
        mn = (model_name or "").lower()
        if "led" in mn or "longformer" in mn or ("long" in mn and "led" in mn):
            return True
        # class name heuristic
        try:
            return "led" in model.__class__.__name__.lower() or "longformer" in model.__class__.__name__.lower()
        except Exception:
            return False

    # ---------------- core generate with LED support ----------------
    def _generate_with_attention(
        self,
        tokenizer: Any,
        model: Any,
        text: str,
        *,
        prefix: str = "",
        truncation_max_length: Optional[int] = None,
        max_new_tokens: Optional[int] = None,
        min_length: Optional[int] = None,
        num_beams: int = 4,
        no_repeat_ngram_size: int = 3,
        length_penalty: float = 1.0,
    ) -> str:
        if prefix:
            input_text = prefix + "\n\n" + text
        else:
            input_text = text

        truncation_max_length = truncation_max_length or getattr(tokenizer, "model_max_length", 1024)

        inputs = tokenizer(input_text, return_tensors="pt", truncation=True, max_length=truncation_max_length)
        input_ids = inputs.get("input_ids")
        attention_mask = inputs.get("attention_mask")

        # move inputs to same device as model when possible
        try:
            model_device = next(model.parameters()).device
            input_ids = input_ids.to(model_device)
            if attention_mask is not None:
                attention_mask = attention_mask.to(model_device)
        except Exception:
            model_device = self._device

        gen_kwargs = dict(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=max_new_tokens or self.min_summary_tokens,
            min_length=min_length or self.min_summary_tokens,
            num_beams=num_beams,
            no_repeat_ngram_size=no_repeat_ngram_size,
            length_penalty=length_penalty,
            early_stopping=True,
            do_sample=False,
        )

        # Attempt to add global_attention_mask for LED-style models (first-token global)
        added_global_mask = False
        try:
            if self._is_led_model(model, getattr(model, "name_or_path", "")) or self._is_led_model(model, self.long_name):
                try:
                    global_attention_mask = torch.zeros_like(input_ids, dtype=torch.long)
                    global_attention_mask[:, 0] = 1
                    gen_kwargs["global_attention_mask"] = global_attention_mask.to(model_device)
                    added_global_mask = True
                    logger.debug("Added global_attention_mask to gen_kwargs (LED-style heuristic).")
                except Exception as e:
                    logger.debug("Failed to construct global_attention_mask: %s", e)
        except Exception:
            # ignore detection failures
            pass

        model.eval()

        # Try generate, and if transformers complains about unused kwargs (e.g., global_attention_mask),
        # remove it and retry once.
        try:
            with torch.no_grad():
                out_ids = model.generate(**gen_kwargs)
        except ValueError as e:
            msg = str(e)
            logger.debug("generate() ValueError: %s", msg)
            if "global_attention_mask" in msg and added_global_mask:
                logger.info("Model rejected global_attention_mask; retrying generate() without it.")
                gen_kwargs.pop("global_attention_mask", None)
                try:
                    with torch.no_grad():
                        out_ids = model.generate(**gen_kwargs)
                except Exception as e2:
                    logger.exception("Retry generate() without global_attention_mask failed: %s", e2)
                    raise
            else:
                # re-raise original error for unexpected cases
                logger.exception("generate() failed with error (not related to global_attention_mask): %s", e)
                raise

        # decode result into string
        try:
            summary = tokenizer.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True)
        except Exception:
            # fallback decode
            summary = tokenizer.decode(out_ids[0], skip_special_tokens=True)
        return " ".join(summary.split()).strip()

    def _self_test_short_model(self) -> None:
        txt = "The quick brown fox jumped over the lazy dog."
        try:
            out = self._generate_with_attention(self._short_tok, self._short_model, txt, prefix="Summarize briefly:", truncation_max_length=self.short_max_tokens, max_new_tokens=32, num_beams=2)
            logger.info("Short model self-test output (len=%d): %s", len(out), out[:200])
        except Exception as e:
            logger.warning("Short model self-test exception: %s", e)

    # ---------------- similarity utils ----------------
    def _similarity_ratio(self, a: str, b: str) -> float:
        a_s, b_s = (a or "").strip(), (b or "").strip()
        if not a_s or not b_s:
            return 0.0
        return SequenceMatcher(None, a_s, b_s).ratio()

    # ---------------- public API ----------------
    def summarize(self, text: str, mode: str = "auto") -> str:
        """
        Summarize text with GPT-like structure and governed token budgets.
        Modes:
        - concise : short (single-paragraph or 3-5 sentences)
        - detailed: multi-paragraph (2-4 paragraphs)
        - full    : long, structured summary (multiple sections)
        - auto    : heuristic based on document type/length
        """
        if not text or not text.strip():
            return "[empty document]"

        cleaned = self._clean_source(text)
        normalized = " ".join(cleaned.split())

        # mode selection & improved target budgets (these are desired budgets; still capped)
        m = (mode or "auto").lower()
        if m == "concise":
            desired_min, desired_max = max(self.min_summary_tokens, 100), min(self.max_summary_tokens_cap, 220)
            instruction = (
                "Provide a brief, high-information summary in one short paragraph (3-5 sentences). "
                "Sections unnecessary — focus on the core facts and the single most important takeaway."
            )
        elif m == "detailed":
            desired_min, desired_max = max(self.min_summary_tokens, 300), min(self.max_summary_tokens_cap, 450)
            instruction = (
                "Provide a detailed summary in 2-4 short paragraphs. "
                "Use clear sectioning: Context, Key Drivers, Main Impacts, and a short Takeaway sentence at the end."
            )
        elif m == "full":
            desired_min, desired_max = max(self.min_summary_tokens, 600), min(self.max_summary_tokens_cap, 1200)
            instruction = (
                "Produce a comprehensive, well-structured summary with labeled sections: "
                "Context, Key Drivers, Social & Economic Impacts, Global Consequences, and Final Takeaway. "
                "Use 4-6 short paragraphs. Preserve factual accuracy and do not hallucinate."
            )
        else:
            # auto heuristic: short if small doc, long otherwise
            total_tok_est = self._token_len(normalized, self._short_tok)
            if total_tok_est <= (self.short_max_tokens // 2):
                m = "concise"
                desired_min, desired_max = max(self.min_summary_tokens, 120), min(self.max_summary_tokens_cap, 220)
                instruction = "Briefly summarize in 1 short paragraph (3-5 sentences)."
            elif total_tok_est <= (self.long_max_tokens if self._long_tok else self.short_max_tokens):
                m = "detailed"
                desired_min, desired_max = max(self.min_summary_tokens, 300), min(self.max_summary_tokens_cap, 450)
                instruction = (
                    "Provide a detailed summary in 2-4 paragraphs with sections: Context, Drivers, Impacts, Takeaway."
                )
            else:
                m = "full"
                desired_min, desired_max = max(self.min_summary_tokens, 600), min(self.max_summary_tokens_cap, 1200)
                instruction = (
                    "Produce a comprehensive, sectioned summary (Context, Drivers, Social & Economic Impacts, Global Consequences, Final Takeaway)."
                )

        # compute budgets respecting caps
        forced_budget = desired_max
        total_tokens = self._token_len(normalized, self._short_tok)
        reserve = 32
        short_cap = max(64, self.short_max_tokens - reserve)
        long_cap = max(256, (self.long_max_tokens - reserve) if self._long_tok else short_cap * 4)

        # Very long docs -> extractive pre-selection to reduce input noise
        if total_tokens > long_cap * 2:
            logger.info("Very long document tokens=%d; running extractive pre-selection", total_tokens)
            selected = self._extract_topk_sentences(cleaned, top_k=min(300, max(80, int(math.sqrt(total_tokens) * 3))))
            normalized = " ".join(selected.split())
            total_tokens = self._token_len(normalized, self._short_tok)
            logger.info("After extractive preselect tokens=%d", total_tokens)

        # choose which model to use (short vs long)
        use_short = total_tokens <= short_cap
        if use_short:
            model_tok, model = self._short_tok, self._short_model
            trunc_cap = self.short_max_tokens
            base_prefix = instruction
        else:
            model_tok = self._long_tok or self._short_tok
            model = self._long_model or self._short_model
            trunc_cap = self.long_max_tokens if self._long_tok else self.short_max_tokens
            # long model gets a two-stage instruction: summarize fragments, then polish
            base_prefix = instruction

        # adapt budget further based on input size (but enforce forced_budget as upper bound)
        budget = min(forced_budget, self._adaptive_summary_budget(total_tokens))

        # If long model and input exceeds its window, chunk -> summarize each chunk -> merge -> polish
        if not use_short and total_tokens > trunc_cap:
            # chunk input by tokens using long tokenizer
            chunks = self._chunk_sentences_by_tokens(normalized, model_tok, max_tokens=trunc_cap, overlap=self.chunk_overlap)
            partials: List[str] = [""] * len(chunks)
            # Parallelize per-chunk summarization with a bounded thread pool
            max_workers = min(8, max(1, len(chunks)))
            def _summ_one(idx: int, c: str) -> tuple[int, str]:
                per_chunk_budget = max(max(self.min_summary_tokens, int(budget * 0.6 / max(1, len(chunks)))), 128)
                try:
                    part = self._generate_with_attention(
                        model_tok,
                        model,
                        c,
                        prefix=f"{base_prefix}\n\nFragment {idx+1}/{len(chunks)}:",
                        truncation_max_length=trunc_cap,
                        max_new_tokens=per_chunk_budget,
                        min_length=max(self.min_summary_tokens, int(per_chunk_budget * 0.25)),
                        num_beams=3,
                        no_repeat_ngram_size=3,
                    )
                except Exception as e:
                    logger.exception("Chunk summarization failed for chunk %d: %s", idx, e)
                    part = c[:1024]
                return idx, part

            with ThreadPoolExecutor(max_workers=max_workers) as ex:
                futures = [ex.submit(_summ_one, i, c) for i, c in enumerate(chunks)]
                for fut in as_completed(futures):
                    i, part = fut.result()
                    partials[i] = part

            merged = "\n\n".join(partials)
            # polish & structure with short instruction model for coherence
            final_budget = min(self.max_summary_tokens_cap, max(self.min_summary_tokens, int(budget)))
            polishing_prefix = (
                base_prefix
                + "\n\nNow merge the fragment summaries into a coherent, labeled summary. "
                + "Keep all factual points, eliminate redundancy, and present labeled sections if requested."
            )
            try:
                summary = self._generate_with_attention(
                    self._short_tok,
                    self._short_model,
                    merged,
                    prefix=polishing_prefix,
                    truncation_max_length=self.short_max_tokens,
                    max_new_tokens=final_budget,
                    min_length=max(self.min_summary_tokens, int(final_budget * 0.25)),
                    num_beams=6,
                    no_repeat_ngram_size=3,
                )
            except Exception as e:
                logger.exception("Polishing step failed: %s", e)
                summary = merged[: max(1024, final_budget * 2)]
        else:
            # single-pass summarization
            try:
                summary = self._generate_with_attention(
                    model_tok,
                    model,
                    normalized,
                    prefix=base_prefix,
                    truncation_max_length=trunc_cap,
                    max_new_tokens=budget,
                    min_length=max(self.min_summary_tokens, int(budget * 0.25)),
                    num_beams=6 if use_short else 4,
                    no_repeat_ngram_size=3,
                    length_penalty=0.9 if use_short else 1.0,
                )
            except Exception as e:
                logger.exception("Primary summarization failed: %s", e)
                summary = ""

        summary = self._cleanup_and_dedupe(summary or "")

        # if model echoed input or summary too similar, retry with stronger directive + extractive forcing
        sim = self._similarity_ratio(normalized[:3000], summary[:3000])
        logger.debug("Similarity(input,summary)=%.3f", sim)
        if sim > 0.78:
            logger.info("Summary too similar to source (sim=%.2f). Retrying with stronger GPT-like prompt.", sim)
            strong_prompt = (
                "You are an expert summarizer. Produce a condensed, structured summary with labeled sections where possible: "
                "Context; Key Drivers; Main Impacts; Global Consequences; Final Takeaway. Use explicit short paragraphs and avoid verbatim copying."
            )
            # prefer short model for polishing
            try:
                extracted = self._extract_topk_sentences(cleaned, top_k=min(120, max(40, int(math.sqrt(total_tokens) * 2))))
                summary = self._generate_with_attention(
                    self._short_tok,
                    self._short_model,
                    extracted,
                    prefix=strong_prompt,
                    truncation_max_length=self.short_max_tokens,
                    max_new_tokens=min(self.max_summary_tokens_cap, max(200, int(budget * 1.2))),
                    min_length=max(self.min_summary_tokens, 120),
                    num_beams=8,
                    no_repeat_ngram_size=4,
                    length_penalty=0.8,
                )
                summary = self._cleanup_and_dedupe(summary or "")
            except Exception as e:
                logger.exception("Retry summarization failed: %s", e)

        # final similarity check -> fallback to extractive first-N sentences if still problematic
        final_sim = self._similarity_ratio(normalized[:3000], summary[:3000])
        if final_sim > 0.86:
            logger.warning("Final summary still too similar (sim=%.2f). Returning extractive fallback.", final_sim)
            sents = self._split_sentences(normalized)
            fallback = " ".join(sents[: min(12, len(sents))])  # longer extractive fallback for full mode
            return fallback if fallback else (summary or normalized[:1000])

        return summary or "[unable to summarize]"


    def _adaptive_summary_budget(self, total_tokens: int) -> int:
        cap = self.max_summary_tokens_cap
        min_t = self.min_summary_tokens
        k = 3.0
        budget = int(k * math.sqrt(max(1, total_tokens)))
        budget = max(min_t, budget)
        budget = min(cap, budget)
        return budget

    def _cleanup_and_dedupe(self, text: str) -> str:
        """
        Normalize whitespace, remove non-printable chars, deduplicate exact lines,
        and collapse excessive blank lines. Returns cleaned text.

        Use this after generation to remove repeated lines introduced by models.
        """
        if not text:
            return ""

        try:
            import re
            # remove high unicode emoji/rare chars (optional)
            text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
            # normalize different newline styles
            text = text.replace("\r\n", "\n").replace("\r", "\n")
            # strip leading/trailing whitespace on each line
            lines = [ln.strip() for ln in text.split("\n")]
            # drop empty lines, but keep paragraph spacing: convert sequences of blanks -> single blank
            out_lines = []
            seen = set()
            last_was_blank = False
            for ln in lines:
                if not ln:
                    # collapse multiple blanks to one blank line
                    if not last_was_blank:
                        out_lines.append("")  # keep a single paragraph break
                        last_was_blank = True
                    # else skip extra blanks
                    continue
                # de-duplicate identical lines (but allow same line in different paragraphs)
                if ln in seen:
                    # if duplicated and previous line is different, skip repeated exact line
                    # (this avoids long repeated paragraphs)
                    continue
                seen.add(ln)
                out_lines.append(ln)
                last_was_blank = False

            # remove leading/trailing blank lines
            while out_lines and out_lines[0] == "":
                out_lines.pop(0)
            while out_lines and out_lines[-1] == "":
                out_lines.pop()

            # join; keep single blank line between paragraphs
            cleaned = []
            skip_next_blank = False
            for ln in out_lines:
                if ln == "":
                    cleaned.append("")  # paragraph break
                else:
                    cleaned.append(ln)
            # final join: paragraphs separated by two newlines
            paragraphs = []
            cur_para = []
            for ln in cleaned:
                if ln == "":
                    if cur_para:
                        paragraphs.append(" ".join(cur_para).strip())
                        cur_para = []
                else:
                    cur_para.append(ln)
            if cur_para:
                paragraphs.append(" ".join(cur_para).strip())

            result = "\n\n".join(p for p in paragraphs if p)
            # collapse repeated spaces inside sentences
            result = re.sub(r"[ \t]{2,}", " ", result)
            return result.strip()
        except Exception:
            # safe fallback - basic cleanup
            return " ".join(text.split()).strip()
