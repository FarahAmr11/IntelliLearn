# transcribe_service_final.py
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

import torch

# faster-whisper preferred
try:
    from faster_whisper import WhisperModel  # type: ignore
    FASTER_WHISPER_AVAILABLE = True
except Exception:
    WhisperModel = None
    FASTER_WHISPER_AVAILABLE = False

# HF pipeline fallback
try:
    from transformers import pipeline
    HF_PIPELINE_AVAILABLE = True
except Exception:
    pipeline = None
    HF_PIPELINE_AVAILABLE = False

# ENV defaults
os.environ.setdefault("ASR_MODEL_HF", "openai/whisper-small")
os.environ.setdefault("ASR_MODEL_FASTER_WHISPER", os.environ.get("ASR_MODEL_HF"))
os.environ.setdefault("ASR_USE_GGML_PATH", "")
os.environ.setdefault("ASR_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
os.environ.setdefault("ASR_CHUNK_LENGTH_S", "30")
os.environ.setdefault("ASR_RETURN_TIMESTAMPS", "True")


@dataclass
class TranscribeService:
    hf_model_name: str = field(default_factory=lambda: os.environ["ASR_MODEL_HF"])
    fw_model_name: str = field(default_factory=lambda: os.environ["ASR_MODEL_FASTER_WHISPER"])
    ggml_path: str = field(default_factory=lambda: os.environ["ASR_USE_GGML_PATH"])
    device: str = field(default_factory=lambda: os.environ["ASR_DEVICE"])
    chunk_length_s: int = field(default_factory=lambda: int(os.environ["ASR_CHUNK_LENGTH_S"]))
    return_timestamps: bool = field(default_factory=lambda: os.environ["ASR_RETURN_TIMESTAMPS"].lower() in ("1", "true", "yes"))

    _fw_model: Any = field(default=None, init=False, repr=False)
    _hf_pipeline: Any = field(default=None, init=False, repr=False)
    _backend: str = field(default="none", init=False)

    def __post_init__(self):
        print(f"[TranscribeService] init: prefer faster-whisper={FASTER_WHISPER_AVAILABLE}, hf-pipeline={HF_PIPELINE_AVAILABLE}")
        # Try faster-whisper first
        if FASTER_WHISPER_AVAILABLE:
            try:
                if self.ggml_path:
                    print(f"[TranscribeService] Loading ggml file via faster-whisper: {self.ggml_path}")
                    # ggml requires cpu
                    self._fw_model = WhisperModel(self.ggml_path, device="cpu", compute_type="int8")
                else:
                    dev = "cuda" if ("cuda" in self.device and torch.cuda.is_available()) else "cpu"
                    compute_type = "float16" if dev == "cuda" else "int8"
                    print(f"[TranscribeService] Loading faster-whisper model '{self.fw_model_name}' on device {dev} (compute={compute_type})")
                    self._fw_model = WhisperModel(self.fw_model_name, device=dev, compute_type=compute_type)
                self._backend = "faster-whisper"
                print("[TranscribeService] faster-whisper loaded.")
            except Exception as e:
                print(f"[TranscribeService] faster-whisper load failed: {e}")
                self._fw_model = None
                self._backend = "none"

        # Fallback to HF pipeline
        if self._backend != "faster-whisper" and HF_PIPELINE_AVAILABLE:
            try:
                device_idx = -1 if self.device == "cpu" else 0
                print(f"[TranscribeService] Initializing HF ASR pipeline model='{self.hf_model_name}' device_idx={device_idx} chunk_length_s={self.chunk_length_s}")
                # create pipeline with the task bound to it
                self._hf_pipeline = pipeline(
                    task="automatic-speech-recognition",
                    model=self.hf_model_name,
                    device=device_idx,
                    chunk_length_s=self.chunk_length_s,
                    ignore_warning=True,
                )
                self._backend = "hf-pipeline"
                print("[TranscribeService] HF pipeline initialized.")
            except Exception as e:
                print(f"[TranscribeService] HF pipeline init failed: {e}")
                self._hf_pipeline = None
                self._backend = "none"

        if self._backend == "none":
            raise RuntimeError("No ASR backend available. Install faster-whisper or transformers with an ASR model.")

    # Public API: accepts file path (string) or object with .file_path
    def transcribe(self, file_path: Union[str, Any], *, language: Optional[str] = None, task: str = "transcribe") -> Dict[str, Any]:
        # normalize file path
        path = file_path.file_path if not isinstance(file_path, str) and hasattr(file_path, "file_path") else str(file_path)
        if not path or not os.path.exists(path):
            raise FileNotFoundError(path)

        print(f"[TranscribeService] transcribe called backend={self._backend} file={path} language={language} task={task}")

        if self._backend == "faster-whisper":
            return self._transcribe_with_faster_whisper(path, language=language, task=task)
        elif self._backend == "hf-pipeline":
            return self._transcribe_with_hf_pipeline(path, language=language)
        else:
            raise RuntimeError("No ASR backend available at runtime.")

    # faster-whisper path
    def _transcribe_with_faster_whisper(self, file_path: str, language: Optional[str], task: str) -> Dict[str, Any]:
        model = self._fw_model
        # build args for faster-whisper.transcribe
        args = dict(
            beam_size=5,
            vad_filter=False,
            language=language if language else None,
            task=task if task in ("transcribe", "translate") else "transcribe",
        )
        print(f"[TranscribeService:faster-whisper] calling transcribe with args={args}")
        try:
            result = model.transcribe(file_path, **{k: v for k, v in args.items() if v is not None})
        except TypeError as e:
            # different faster-whisper versions have different param names; try simpler call
            print(f"[TranscribeService:faster-whisper] transcribe TypeError, retrying simple call: {e}")
            result = model.transcribe(file_path)
        except Exception as e:
            print(f"[TranscribeService:faster-whisper] transcribe failed: {e}")
            raise

        # Normalize result
        language_detected = result.get("language") if isinstance(result, dict) else None
        text = result.get("text") if isinstance(result, dict) else str(result)
        segments = result.get("segments") if isinstance(result, dict) else None

        print(f"[TranscribeService:faster-whisper] done language={language_detected} text_len={len(text or '')} segments={len(segments) if segments else 0}")
        return {"text": text, "language": language_detected or language, "segments": segments, "raw": result}

    # HF pipeline path (robust call with retries for unsupported kwargs)
    def _transcribe_with_hf_pipeline(self, file_path: str, language: Optional[str]) -> Dict[str, Any]:
        pipe = self._hf_pipeline
        # safe kwargs to try when calling pipeline
        call_attempts = [
            {"return_timestamps": "word", "language": language} if language else {"return_timestamps": "word"},
            {"return_timestamps": True, "language": language} if language else {"return_timestamps": True},
            {"language": language} if language else {},
            {},
        ]

        last_exception = None
        res = None
        for attempt_idx, call_kwargs in enumerate(call_attempts, start=1):
            # remove None values
            call_kwargs = {k: v for k, v in (call_kwargs or {}).items() if v is not None}
            try:
                print(f"[TranscribeService:hf-pipeline] calling pipeline attempt {attempt_idx} kwargs={call_kwargs}")
                res = pipe(file_path, **call_kwargs) if call_kwargs else pipe(file_path)
                print(f"[TranscribeService:hf-pipeline] pipeline call succeeded on attempt {attempt_idx}")
                last_exception = None
                break
            except TypeError as e:
                # unsupported kwarg was passed to pipeline call; try next attempt without it
                print(f"[TranscribeService:hf-pipeline] pipeline call TypeError (likely unsupported kwargs): {e}")
                last_exception = e
                continue
            except Exception as e:
                print(f"[TranscribeService:hf-pipeline] pipeline call failed: {e}")
                last_exception = e
                continue

        if res is None:
            # all attempts failed
            raise RuntimeError(f"HF pipeline transcription failed (last error: {last_exception})")

        # Normalize different pipeline return shapes
        # Examples:
        # - dict: {"text": "...", "chunks": [...], "language": "en"}
        # - str: "...transcript..."
        # - list of dicts (per-chunk)
        text = ""
        lang = None
        segments = None
        try:
            if isinstance(res, dict):
                # text key may be 'text' or 'transcription'
                text = res.get("text") or res.get("transcription") or ""
                lang = res.get("language") or res.get("detected_language") or None
                segments = res.get("segments") or res.get("chunks") or res.get("words") or None
            elif isinstance(res, str):
                text = res
            elif isinstance(res, list):
                # combine list-of-chunks
                parts: List[str] = []
                for item in res:
                    if isinstance(item, dict):
                        parts.append(item.get("text") or item.get("transcription") or "")
                    else:
                        parts.append(str(item))
                text = " ".join(parts).strip()
            else:
                # fallback: stringify
                text = str(res)
        except Exception as e:
            print(f"[TranscribeService:hf-pipeline] normalization error: {e}; using raw str")
            text = str(res)

        print(f"[TranscribeService:hf-pipeline] result text_len={len(text)} lang={lang} segments={len(segments) if segments else 0}")
        return {"text": text, "language": lang or language, "segments": segments, "raw": res}
