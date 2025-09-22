# translate_service_final.py
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional
import torch
import re

# transformers optional import
try:
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
    TRANSFORMERS_AVAILABLE = True
except Exception:
    AutoTokenizer = AutoModelForSeq2SeqLM = pipeline = None  # type: ignore
    TRANSFORMERS_AVAILABLE = False

# optional langdetect
try:
    from langdetect import detect as _langdetect_detect  # type: ignore
    LANGDETECT_AVAILABLE = True
except Exception:
    _langdetect_detect = None  # type: ignore
    LANGDETECT_AVAILABLE = False

# ENV defaults (can override externally)
os.environ.setdefault("TRANSLATE_MODEL_MANY", "facebook/mbart-large-50-many-to-many-mmt")
os.environ.setdefault("TRANSLATE_MODEL_FALLBACK", "Helsinki-NLP/opus-mt-mul-en")
os.environ.setdefault("TRANSLATE_LANGID_MODEL", "papluca/xlm-roberta-base-language-detection")
os.environ.setdefault("TRANSLATE_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
os.environ.setdefault("TRANSLATE_SELFTEST_TARGET", "en")


# --- language keys you provided (tokenizer-style names) ---
# We'll use this list to help mapping short codes like 'es' -> 'es_XX' when possible.
SUPPORTED_LANG_TOKEN_KEYS = [
    "ar_AR","cs_CZ","de_DE","en_XX","es_XX","et_EE","fi_FI","fr_XX","gu_IN","hi_IN","it_IT","ja_XX",
    "kk_KZ","ko_KR","lt_LT","lv_LV","my_MM","ne_NP","nl_XX","ro_RO","ru_RU","si_LK","tr_TR","vi_VN",
    "zh_CN","af_ZA","az_AZ","bn_IN","fa_IR","he_IL","hr_HR","id_ID","ka_GE","km_KH","mk_MK","ml_IN",
    "mn_MN","mr_IN","pl_PL","ps_AF","pt_XX","sv_SE","sw_KE","ta_IN","te_IN","th_TH","tl_XX","uk_UA",
    "ur_PK","xh_ZA","gl_ES","sl_SI"
]
# Normalize to lower-case keys for matching convenience
SUPPORTED_LANG_TOKEN_KEYS_LOWER = [k.lower() for k in SUPPORTED_LANG_TOKEN_KEYS]


@dataclass
class TranslateService:
    many_model_name: str = field(default_factory=lambda: os.environ["TRANSLATE_MODEL_MANY"])
    fallback_model_name: str = field(default_factory=lambda: os.environ["TRANSLATE_MODEL_FALLBACK"])
    langid_model_name: str = field(default_factory=lambda: os.environ["TRANSLATE_LANGID_MODEL"])
    device_str: str = field(default_factory=lambda: os.environ["TRANSLATE_DEVICE"])
    selftest_target: str = field(default_factory=lambda: os.environ["TRANSLATE_SELFTEST_TARGET"])

    _many_tok: Any = field(default=None, init=False, repr=False)
    _many_model: Any = field(default=None, init=False, repr=False)
    _fallback_tok: Any = field(default=None, init=False, repr=False)
    _fallback_model: Any = field(default=None, init=False, repr=False)
    _langid_pipeline: Any = field(default=None, init=False, repr=False)

    _device: torch.device = field(init=False)

    def __post_init__(self):
        self._device = torch.device(self.device_str if isinstance(self.device_str, str) else "cpu")
        print(f"[TranslateService] device: {self._device}")

        if not TRANSFORMERS_AVAILABLE:
            raise RuntimeError("transformers not available. Install transformers to use TranslateService.")

        # Try to load many->many (mbart/m2m)
        try:
            print(f"[TranslateService] Loading many->many model: {self.many_model_name} ...")
            self._many_tok = AutoTokenizer.from_pretrained(self.many_model_name, use_fast=True)
            self._many_model = AutoModelForSeq2SeqLM.from_pretrained(self.many_model_name).to(self._device)
            self._backend = "many"
            print(f"[TranslateService] loaded many->many backend: {self.many_model_name}")
        except Exception as e:
            print(f"[TranslateService] Could not load many->many model '{self.many_model_name}': {e}")
            self._many_tok = None
            self._many_model = None
            self._backend = "none"

        # Load fallback model (often many->en or small general model)
        try:
            print(f"[TranslateService] Loading fallback model: {self.fallback_model_name} ...")
            self._fallback_tok = AutoTokenizer.from_pretrained(self.fallback_model_name, use_fast=True)
            self._fallback_model = AutoModelForSeq2SeqLM.from_pretrained(self.fallback_model_name).to(self._device)
            if self._backend == "none":
                self._backend = "fallback"
            print(f"[TranslateService] loaded fallback backend: {self.fallback_model_name}")
        except Exception as e:
            print(f"[TranslateService] Could not load fallback model '{self.fallback_model_name}': {e}")
            self._fallback_tok = None
            self._fallback_model = None

        # lang-id pipeline if langdetect not available
        if not LANGDETECT_AVAILABLE:
            try:
                print(f"[TranslateService] Loading HF lang-id pipeline: {self.langid_model_name} ...")
                self._langid_pipeline = pipeline("text-classification", model=self.langid_model_name,
                                                device=0 if str(self._device).startswith("cuda") else -1)
                print("[TranslateService] lang-id pipeline ready")
            except Exception as e:
                print(f"[TranslateService] Lang-id pipeline unavailable: {e}")
                self._langid_pipeline = None
        else:
            self._langid_pipeline = None

        # quick self-test (non-fatal)
        try:
            sample = "This is a tiny test."
            out = self.translate(sample, target_lang=self.selftest_target, source_lang="en")
            print(f"[TranslateService] self-test output (truncated): {str(out)[:120]}")
        except Exception as e:
            print(f"[TranslateService] self-test failed: {e}")

    # ---------------- utilities ----------------
    def _detect_language(self, text: str) -> Optional[str]:
        if not text or not text.strip():
            return None
        if LANGDETECT_AVAILABLE:
            try:
                return _langdetect_detect(text)
            except Exception:
                pass
        if self._langid_pipeline is not None:
            try:
                out = self._langid_pipeline(text[:4000])
                if isinstance(out, list) and out:
                    label = out[0].get("label", "")
                    if ":" in label:
                        label = label.split(":", 1)[-1]
                    return label.lower()
            except Exception:
                pass
        return None

    def _normalize_lang_code(self, code: str) -> Optional[str]:
        if not code:
            return None
        return code.strip().lower().replace("-", "_")

    def _map_short_to_tok_key(self, tok: Any, short_code: str) -> Optional[str]:
        """
        Try to map a short code like 'es' or 'es_XX' to an actual tokenizer key.
        Uses tokenizer.lang_code_to_id if available, otherwise uses SUPPORTED_LANG_TOKEN_KEYS.
        """
        if not short_code:
            return None
        code = self._normalize_lang_code(short_code)

        # if tokenizer present and has lang_code_to_id, try to find an exact or best match
        if tok is not None and getattr(tok, "lang_code_to_id", None):
            l2id = tok.lang_code_to_id
            # exact match
            if code in l2id:
                return code
            # candidate patterns
            candidates = [f"{code}_xx", f"{code}_xx".upper(), f"{code}_xx".replace("_xx", "_XX"), code.upper(), code.lower()]
            # also try appending _XX, or substituting region from supported list
            if code + "_xx" in l2id:
                return code + "_xx"
            if code + "_XX" in l2id:
                return code + "_XX"
            for cand in candidates:
                if cand in l2id:
                    return cand
            # fuzzy: find a key that startswith code (e.g. 'es' -> 'es_XX')
            for k in l2id.keys():
                if k.lower().startswith(code):
                    return k
        # If tokenizer lacks lang map, consult SUPPORTED_LANG_TOKEN_KEYS provided by user
        for key in SUPPORTED_LANG_TOKEN_KEYS_LOWER:
            if key.startswith(code):
                return key
        # last resort: return None
        return None

    def _clean_text_for_translation(self, text: str) -> str:
        """Light cleaning: normalize smart quotes/newlines and fix punctuation spacing."""
        if not text:
            return text
        s = text
        s = s.replace("‘", "'").replace("’", "'").replace("“", '"').replace("”", '"')
        # remove hyphen-newline hyphenation, collapse newlines to single spaces
        s = re.sub(r"-\s*\n\s*", "", s)
        s = re.sub(r"\s*\n\s*", " ", s)
        # ensure space after punctuation when missing
        s = re.sub(r"([.!?])([A-Za-z0-9\"'(\[])","\\1 \\2", s)
        s = re.sub(r"\s{2,}", " ", s).strip()
        return s

    # ---------------- translate helpers ----------------
    def _translate_with_many(self, text: str, src: str, tgt: str) -> Optional[str]:
        """Try to translate using many->many model (mbart/m2m). Returns string or None on failure."""
        if self._many_model is None or self._many_tok is None:
            print("[translate:many] many model unavailable")
            return None

        tok = self._many_tok
        model = self._many_model

        tgt_key = self._map_short_to_tok_key(tok, tgt)
        if not tgt_key:
            print(f"[translate:many] cannot map target '{tgt}' to tokenizer keys")
            return None

        # set tokenizer src_lang if supported
        try:
            if hasattr(tok, "src_lang"):
                tok.src_lang = src
        except Exception:
            pass

        forced_bos = tok.lang_code_to_id.get(tgt_key, None) if getattr(tok, "lang_code_to_id", None) else None
        if forced_bos is None:
            print(f"[translate:many] tokenizer key '{tgt_key}' present but no id found")
            return None

        # tokenize and move to model device
        max_len = min(getattr(tok, "model_max_length", 4096), 4096)
        inputs = tok(text, return_tensors="pt", truncation=True, max_length=max_len, padding=True)
        try:
            device = next(model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}
        except Exception:
            pass

        gen_kwargs = dict(
            input_ids=inputs.get("input_ids"),
            attention_mask=inputs.get("attention_mask"),
            max_new_tokens=512,
            num_beams=4,
            no_repeat_ngram_size=3,
            length_penalty=1.0,
            early_stopping=True,
            forced_bos_token_id=int(forced_bos),
        )

        model.eval()
        with torch.no_grad():
            out_ids = model.generate(**gen_kwargs)

        translation = tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
        print(f"[translate:many] produced translation len={len(translation)}")
        return translation

    def _translate_with_per_pair(self, text: str, src: str, tgt: str) -> Optional[str]:
        """Try to load / use Helsinki per-pair model (Helsinki-NLP/opus-mt-src-tgt)."""
        if src == tgt:
            return text
        per_pair = f"Helsinki-NLP/opus-mt-{src}-{tgt}"
        try:
            print(f"[translate:perpair] trying {per_pair}")
            tok = AutoTokenizer.from_pretrained(per_pair, use_fast=True)
            model = AutoModelForSeq2SeqLM.from_pretrained(per_pair).to(self._device)
            inputs = tok(text, return_tensors="pt", truncation=True, max_length=min(tok.model_max_length, 1024)).to(self._device)
            with torch.no_grad():
                out_ids = model.generate(**inputs, max_new_tokens=512, num_beams=4)
            translation = tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
            print(f"[translate:perpair] success using {per_pair}")
            return translation
        except Exception as e:
            print(f"[translate:perpair] failed {per_pair}: {e}")
            # try reverse pair (sometimes a model exists in reverse direction)
            try:
                per_pair_rev = f"Helsinki-NLP/opus-mt-{tgt}-{src}"
                print(f"[translate:perpair] trying reverse {per_pair_rev}")
                tok = AutoTokenizer.from_pretrained(per_pair_rev, use_fast=True)
                model = AutoModelForSeq2SeqLM.from_pretrained(per_pair_rev).to(self._device)
                inputs = tok(text, return_tensors="pt", truncation=True, max_length=min(tok.model_max_length, 1024)).to(self._device)
                with torch.no_grad():
                    out_ids = model.generate(**inputs, max_new_tokens=512, num_beams=4)
                translation = tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
                print(f"[translate:perpair] success using {per_pair_rev}")
                return translation
            except Exception as e2:
                print(f"[translate:perpair] reverse also failed: {e2}")
                return None

    def _translate_with_fallback(self, text: str, src: str, tgt: str) -> Optional[str]:
        """Use preloaded fallback (e.g., many->en) if target is 'en'."""
        if self._fallback_model is None or self._fallback_tok is None:
            return None
        # fallback model is typically many->en (mul->en). Only use if target == 'en'
        if tgt != "en":
            return None
        try:
            inputs = self._fallback_tok(text, return_tensors="pt", truncation=True, max_length=min(self._fallback_tok.model_max_length, 1024)).to(self._device)
            with torch.no_grad():
                out_ids = self._fallback_model.generate(**inputs, max_new_tokens=512, num_beams=4)
            translation = self._fallback_tok.decode(out_ids[0], skip_special_tokens=True, clean_up_tokenization_spaces=True).strip()
            print("[translate:fallback] used fallback model")
            return translation
        except Exception as e:
            print(f"[translate:fallback] fallback failed: {e}")
            return None

    # ---------------- Public API ----------------
    def translate(self, text: str, target_lang: str = "en", source_lang: Optional[str] = None) -> str:
        """
        Translate `text` into `target_lang` (like 'en', 'es', 'fr', or token keys like 'es_XX').
        Returns translated string only.
        """
        if not text or not text.strip():
            return ""

        cleaned = self._clean_text_for_translation(text)

        # detect source if not provided
        src = source_lang or self._detect_language(cleaned) or "en"
        src = self._normalize_lang_code(src)
        tgt = self._normalize_lang_code(target_lang)

        print(f"[TranslateService.translate] src={src} tgt={tgt}")

        # short-circuit same language
        if src == tgt:
            print("[TranslateService] source == target, returning original text")
            return cleaned

        # Try many->many first (if available)
        try:
            translated = self._translate_with_many(cleaned, src, tgt)
            if translated:
                return translated
        except Exception as e:
            print(f"[TranslateService] many->many attempt failed: {e}")

        # Try per-pair Helsinki
        try:
            per = self._translate_with_per_pair(cleaned, src, tgt)
            if per:
                return per
        except Exception as e:
            print(f"[TranslateService] per-pair attempt raised: {e}")

        # Try fallback (only for target 'en')
        try:
            fb = self._translate_with_fallback(cleaned, src, tgt)
            if fb:
                return fb
        except Exception as e:
            print(f"[TranslateService] fallback attempt raised: {e}")

        # last resort: return input if nothing worked (safer than crashing)
        print("[TranslateService] No backend could translate; returning original text")
        return cleaned
