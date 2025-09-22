# processing.py
from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any

from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import SQLAlchemyError

from ..extensions import db
from ..models import ProcessingJob, JobType, JobStatus, Document
from ..utils.auth import require_auth
from ..services import summarizer, transcriber, translator
from ..models import ProcessingJob, JobType, JobStatus, Document

processing_bp = Blueprint("processing", __name__)


# -------------------------
# Helpers
# -------------------------
def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _safe_json_load(s: str | None) -> dict:
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {}


def _json_dumps(obj: Any) -> str:
    try:
        return json.dumps(obj)
    except Exception:
        # fallback to string representation
        return json.dumps({"value": str(obj)})


def _create_job(user_id: int, job_type: str, document_id: int | None, params: dict, input_meta: dict | None = None) -> ProcessingJob:
    job = ProcessingJob(
        user_id=user_id,
        job_type=job_type,
        document_id=document_id,
        status=JobStatus.PENDING,
        params_json=_json_dumps(params or {}),
        input_json=_json_dumps(input_meta or {}),
        started_at=None,
        finished_at=None,
    )
    db.session.add(job)
    db.session.commit()
    return job


def _init_result_struct() -> dict:
    return {"overall_status": "running", "steps": [], "errors": []}


def _find_completed_step(result: dict, name: str) -> dict | None:
    for s in result.get("steps", []):
        if s.get("name") == name and s.get("status") == "completed":
            return s
    return None


def _upsert_step(result: dict, step_obj: dict) -> dict:
    steps = result.get("steps", [])
    found = False
    for i, s in enumerate(steps):
        if s.get("name") == step_obj.get("name"):
            steps[i] = step_obj
            found = True
            break
    if not found:
        steps.append(step_obj)
    result["steps"] = steps
    return result


def _finalize_job_success(job: ProcessingJob, result: dict) -> None:
    job.status = JobStatus.COMPLETED
    job.finished_at = datetime.utcnow()
    result["overall_status"] = "completed"
    job.result_json = _json_dumps(result)
    db.session.commit()


def _finalize_job_failure(job: ProcessingJob, result: dict, exc: Exception) -> None:
    job.status = JobStatus.FAILED
    job.finished_at = datetime.utcnow()
    job.error_message = str(exc)
    result.setdefault("errors", []).append({"error": str(exc), "time": _now_iso()})
    job.result_json = _json_dumps(result)
    db.session.commit()


# -------------------------
# Core step implementations
# -------------------------
def _step_transcribe(job: ProcessingJob, doc: Document | None, result: dict) -> dict:
    step_name = "transcribe"
    # if already done, skip
    if _find_completed_step(result, step_name):
        return result

    step = {"name": step_name, "status": "running", "started_at": _now_iso(), "output": None, "models": {}}
    try:
        # Determine source (document file_path or other)
        src = None
        if doc and getattr(doc, "file_path", None):
            src = doc.file_path
        else:
            # allow input_json to contain a file_path for ad-hoc jobs
            input_meta = _safe_json_load(job.input_json)
            src = input_meta.get("file_path")

        # Call transcriber - may accept Document or file path depending on service
        raw_out = None
        try:
            # prefer transcriber.transcribe(doc) if service supports Document
            raw_out = transcriber.transcribe(doc if doc is not None else src)
        except TypeError:
            # fallback to passing file path
            raw_out = transcriber.transcribe(src)
        except Exception as e:
            # still try to call with src string
            try:
                raw_out = transcriber.transcribe(src)
            except Exception:
                raise

        # Normalize output
        if isinstance(raw_out, str):
            out_text = raw_out
            lang = None
            segments = None
        elif isinstance(raw_out, dict):
            out_text = raw_out.get("text") or raw_out.get("transcription") or ""
            lang = raw_out.get("language")
            segments = raw_out.get("segments") or raw_out.get("chunks")
        else:
            out_text = str(raw_out)
            lang = None
            segments = None

        # Ensure raw_out is JSON serializable
        try:
            json.dumps(raw_out)
        except (TypeError, ValueError):
            # Convert non-serializable objects to string
            raw_out = str(raw_out)

        # Persist to Document if available
        if doc:
            doc.text_content = out_text
            if lang:
                doc.language = lang
            db.session.commit()

        step["output"] = {
            "transcription": out_text,  # Frontend expects 'transcription' field
            "text": out_text,           # Keep for backward compatibility
            "language": lang, 
            "segments": segments, 
            "raw": raw_out
        }
        step["status"] = "completed"
        step["finished_at"] = _now_iso()
        result = _upsert_step(result, step)
        job.result_json = _json_dumps(result)
        db.session.commit()
        return result
    except Exception as exc:
        step["status"] = "failed"
        step["finished_at"] = _now_iso()
        step["output"] = {"error": str(exc)}
        result = _upsert_step(result, step)
        raise


def _step_summarize(job: ProcessingJob, doc: Document | None, result: dict, mode: str = "concise") -> dict:
    step_name = "summarize"
    if _find_completed_step(result, step_name):
        return result

    step = {"name": step_name, "status": "running", "started_at": _now_iso(), "output": None, "models": {}}
    try:
        # Find source text: prefer doc.text_content, else previous transcribe step
        source_text = None
        if doc and doc.text_content:
            source_text = doc.text_content
        else:
            prev = _find_completed_step(result, "transcribe")
            if prev:
                source_text = (prev.get("output") or {}).get("text")
            if not source_text:
                # NEW: support synthetic input_text step (direct text input)
                input_step = _find_completed_step(result, "input_text")
                if input_step:
                    source_text = (input_step.get("output") or {}).get("text")

        if not source_text or not source_text.strip():
            raise RuntimeError("No text available to summarize")

        # Call summarizer (may be an object with summarize method)
        try:
            summary_out = summarizer.summarize(source_text, mode=mode)
        except TypeError:
            # in case summarizer is a callable or expects different signature
            summary_out = summarizer.summarize(source_text)

        if isinstance(summary_out, str):
            summary_text = summary_out
            raw = summary_out
        elif isinstance(summary_out, dict):
            summary_text = summary_out.get("summary") or summary_out.get("text") or ""
            raw = summary_out.get("raw", summary_out)
        else:
            summary_text = str(summary_out)
            raw = summary_out

        # Ensure raw is JSON serializable
        try:
            json.dumps(raw)
        except (TypeError, ValueError):
            # Convert non-serializable objects to string
            raw = str(raw)

        # persist
        if doc:
            doc.summary = summary_text
            db.session.commit()

        step["output"] = {"summary": summary_text, "raw": raw}
        step["status"] = "completed"
        step["finished_at"] = _now_iso()
        result = _upsert_step(result, step)
        job.result_json = _json_dumps(result)
        db.session.commit()
        return result
    except Exception as exc:
        step["status"] = "failed"
        step["finished_at"] = _now_iso()
        step["output"] = {"error": str(exc)}
        result = _upsert_step(result, step)
        raise


def _step_translate(job: ProcessingJob, doc: Document | None, result: dict, target_lang: str = "en", source_lang: str = None) -> dict:
    step_name = "translate"
    if _find_completed_step(result, step_name):
        return result

    step = {"name": step_name, "status": "running", "started_at": _now_iso(), "output": None, "models": {}}
    try:
        # Choose text to translate: prefer summary (if present), else transcript, else doc.text_content
        source_text = None
        prev_summary = _find_completed_step(result, "summarize")
        if prev_summary:
            source_text = (prev_summary.get("output") or {}).get("summary")
        else:
            prev_trans = _find_completed_step(result, "transcribe")
            if prev_trans:
                source_text = (prev_trans.get("output") or {}).get("text")
            elif doc and doc.text_content:
                source_text = doc.text_content
        if not source_text:
            # NEW: support synthetic input_text step (direct text input)
            input_step = _find_completed_step(result, "input_text")
            if input_step:
                source_text = (input_step.get("output") or {}).get("text")

        if not source_text or not source_text.strip():
            raise RuntimeError("No text available to translate")

        # Call translator
        try:
            trans_out = translator.translate(source_text, target_lang=target_lang, source_lang=source_lang)
        except TypeError:
            # Fallback for different translator signatures
            try:
                trans_out = translator.translate(source_text, target_lang, source_lang)
            except TypeError:
                trans_out = translator.translate(source_text, target_lang)

        if isinstance(trans_out, str):
            translation_text = trans_out
            src_lang = None
            raw = trans_out
        elif isinstance(trans_out, dict):
            translation_text = trans_out.get("translation") or trans_out.get("text") or ""
            src_lang = trans_out.get("source_lang") or trans_out.get("detected_source") or None
            raw = trans_out.get("raw", trans_out)
        else:
            translation_text = str(trans_out)
            src_lang = None
            raw = trans_out

        # Ensure raw is JSON serializable
        try:
            json.dumps(raw)
        except (TypeError, ValueError):
            # Convert non-serializable objects to string
            raw = str(raw)

        # persist
        if doc:
            doc.translated_text = translation_text
            if src_lang:
                doc.source_language = src_lang
            db.session.commit()

        step["output"] = {"translation": translation_text, "source_lang": src_lang, "target_lang": target_lang, "raw": raw}
        step["status"] = "completed"
        step["finished_at"] = _now_iso()
        result = _upsert_step(result, step)
        job.result_json = _json_dumps(result)
        db.session.commit()
        return result
    except Exception as exc:
        step["status"] = "failed"
        step["finished_at"] = _now_iso()
        step["output"] = {"error": str(exc)}
        result = _upsert_step(result, step)
        raise


# -------------------------
# Endpoints
# -------------------------

@processing_bp.post("/start")
@require_auth
def start_processing(user):
    """
    Start a composite processing job (synchronous).
    Body JSON:
      - document_id (optional)
      - text (optional) — ad-hoc text to process
      - operations: list of steps in order e.g. ["transcribe","summarize","translate"]
      - mode: summarizer mode (concise|detailed|full)
      - target_lang: target language for translation (default "en")
    """
    data = request.get_json() or {}
    doc_id = data.get("document_id")
    text = data.get("text")
    operations = data.get("operations", [])
    if not isinstance(operations, list) or len(operations) == 0:
        return jsonify({"error": "operations must be a non-empty list"}), 400

    mode = (data.get("mode") or "concise").lower()
    target_lang = (data.get("target_lang") or "en").lower()

    doc = None
    if doc_id:
        doc = Document.query.filter_by(id=doc_id, user_id=user.id).first()
        if not doc:
            return jsonify({"error": "document not found"}), 404

    # create job (PENDING) then process synchronously (we mark RUNNING here)
    params = {"operations": operations, "mode": mode, "target_lang": target_lang}
    input_meta = {"document_id": doc_id, "text_snippet": (text[:1000] if text else None), "created_at": _now_iso()}
    job = _create_job(user.id, "composite", doc.id if doc else None, params, input_meta)

    # Start processing immediately (synchronous)
    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        # Initialize / load result struct
        result = _init_result_struct()
        # If job was created with ad-hoc text, ensure the doc-like flow: create transient doc object? We'll treat text via input_json
        # For summary/translate steps, source text is taken from document or previous steps; to support ad-hoc text, we write a pseudo transcribe step initially.
        if text and "transcribe" not in operations and ("summarize" in operations or "translate" in operations):
            # insert a synthetic 'input_text' step so subsequent steps can use it as source
            synthetic = {
                "name": "input_text",
                "status": "completed",
                "started_at": _now_iso(),
                "finished_at": _now_iso(),
                "output": {"text": text},
            }
            result = _upsert_step(result, synthetic)
            job.result_json = _json_dumps(result)
            db.session.commit()

        # Run operations sequentially
        for op in operations:
            if op == "transcribe":
                result = _step_transcribe(job, doc, result)
            elif op == "summarize":
                # If synthetic input_text exists, prefer it as source by placing it as prior transcribe-like step
                # Temporarily treat 'input_text' as available via result structure
                # Summarizer will look at doc.text_content or prior transcribe step
                result = _step_summarize(job, doc, result, mode=mode)
            elif op == "translate":
                result = _step_translate(job, doc, result, target_lang=target_lang)
            else:
                # unknown op
                raise RuntimeError(f"Unknown operation '{op}'")

        _finalize_job_success(job, result)
        return jsonify({"job_id": job.id, "status": job.status, "result": result})
    except Exception as exc:
        # failure handling
        try:
            _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        except Exception:
            # best effort
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            db.session.commit()
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.post("/transcribe")
@require_auth
def transcribe_endpoint(user):
    data = request.get_json() or {}
    document_id = data.get("document_id")
    force = bool(data.get("force") or False)
    
    if not document_id:
        return jsonify({"error": "document_id required"}), 400

    doc = Document.query.filter_by(id=document_id, user_id=user.id).first()
    if not doc:
        return jsonify({"error": "document not found"}), 404
    
    # If not forced and document already has transcription, return existing transcription
    if not force and doc.text_content and doc.text_content.strip():
        return jsonify({
            "job_id": None,
            "status": "existing",
            "transcription": doc.text_content
        })

    job = _create_job(user.id, JobType.TRANSCRIBE, doc.id, {}, {"document_id": doc.id, "created_at": _now_iso()})

    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        result = _init_result_struct()
        result = _step_transcribe(job, doc, result)
        _finalize_job_success(job, result)
        
        # Extract the transcription for direct access
        job_result = _safe_json_load(job.result_json)
        transcription = None
        if job_result.get("steps"):
            transcribe_step = next((s for s in job_result["steps"] if s.get("name") == "transcribe"), None)
            if transcribe_step and transcribe_step.get("output"):
                transcription = transcribe_step["output"].get("transcription") or transcribe_step["output"].get("text")
        
        # Return structured result with direct access
        return jsonify({
            "job_id": job.id, 
            "status": job.status, 
            "result": job_result,
            "transcription": transcription  # Direct access for frontend
        })
    except Exception as exc:
        _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.post("/summarize")
@require_auth
def summarize_endpoint(user):
    data = request.get_json() or {}
    document_id = data.get("document_id")
    raw_text = data.get("text")
    mode = (data.get("mode") or "concise").lower()
    force = bool(data.get("force") or False)
    
    # If document provided, use that. If raw_text provided, create synthetic job input (no doc).
    doc = None
    if document_id:
        doc = Document.query.filter_by(id=document_id, user_id=user.id).first()
        if not doc:
            return jsonify({"error": "document not found"}), 404
        
        # If not forced and document already has a summary, return existing summary
        if not force and doc.summary and doc.summary.strip():
            return jsonify({
                "job_id": None,
                "status": "existing",
                "summary": doc.summary
            })

    job = _create_job(user.id, JobType.SUMMARIZE, doc.id if doc else None, {"mode": mode, "force": force}, {"document_id": document_id, "text_snippet": (raw_text[:1000] if raw_text else None), "created_at": _now_iso()})

    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        result = _init_result_struct()
        if raw_text:
            # synthetic input_text step for summarization
            synthetic = {
                "name": "input_text",
                "status": "completed",
                "started_at": _now_iso(),
                "finished_at": _now_iso(),
                "output": {"text": raw_text},
            }
            result = _upsert_step(result, synthetic)
            job.result_json = _json_dumps(result)
            db.session.commit()

        result = _step_summarize(job, doc, result, mode=mode)
        _finalize_job_success(job, result)
        
        # Extract the summary for direct access
        job_result = _safe_json_load(job.result_json)
        summary = None
        if job_result.get("steps"):
            summarize_step = next((s for s in job_result["steps"] if s.get("name") == "summarize"), None)
            if summarize_step and summarize_step.get("output"):
                summary = summarize_step["output"].get("summary")
        
        # Return structured result with direct access
        return jsonify({
            "job_id": job.id, 
            "status": job.status, 
            "result": job_result,
            "summary": summary  # Direct access for frontend
        })
    except Exception as exc:
        _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.post("/translate")
@require_auth
def translate_endpoint(user):
    data = request.get_json() or {}
    document_id = data.get("document_id")
    raw_text = data.get("text")
    target_lang = (data.get("target_lang") or "en").lower()
    source_lang = data.get("source_lang")  # Optional source language
    force = bool(data.get("force") or False)

    doc = None
    if document_id:
        doc = Document.query.filter_by(id=document_id, user_id=user.id).first()
        if not doc:
            return jsonify({"error": "document not found"}), 404
        
        # If not forced and document already has translation, return existing translation
        if not force and doc.translated_text and doc.translated_text.strip():
            return jsonify({
                "job_id": None,
                "status": "existing",
                "translation": doc.translated_text
            })

    job = _create_job(user.id, JobType.TRANSLATE, doc.id if doc else None, {"target_lang": target_lang, "source_lang": source_lang, "force": force}, {"document_id": document_id, "text_snippet": (raw_text[:1000] if raw_text else None), "created_at": _now_iso()})

    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        result = _init_result_struct()
        if raw_text:
            synthetic = {
                "name": "input_text",
                "status": "completed",
                "started_at": _now_iso(),
                "finished_at": _now_iso(),
                "output": {"text": raw_text},
            }
            result = _upsert_step(result, synthetic)
            job.result_json = _json_dumps(result)
            db.session.commit()

        result = _step_translate(job, doc, result, target_lang=target_lang, source_lang=source_lang)
        _finalize_job_success(job, result)
        
        # Extract the translation for direct access
        job_result = _safe_json_load(job.result_json)
        translation = None
        if job_result.get("steps"):
            translate_step = next((s for s in job_result["steps"] if s.get("name") == "translate"), None)
            if translate_step and translate_step.get("output"):
                translation = translate_step["output"].get("translation")
        
        # Return structured result with direct access
        return jsonify({
            "job_id": job.id, 
            "status": job.status, 
            "result": job_result,
            "translation": translation  # Direct access for frontend
        })
    except Exception as exc:
        _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.post("/text/summarize")
@require_auth
def text_only_summarize(user):
    data = request.get_json() or {}
    raw_text = (data.get("text") or "").strip()
    mode = (data.get("mode") or "concise").lower()
    if not raw_text:
        return jsonify({"error": "text is required"}), 400

    job = _create_job(user.id, JobType.SUMMARIZE, None, {"mode": mode}, {"text_snippet": raw_text[:1000], "created_at": _now_iso()})
    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        result = _init_result_struct()
        synthetic = {
            "name": "input_text",
            "status": "completed",
            "started_at": _now_iso(),
            "finished_at": _now_iso(),
            "output": {"text": raw_text},
        }
        result = _upsert_step(result, synthetic)
        job.result_json = _json_dumps(result)
        db.session.commit()

        result = _step_summarize(job, None, result, mode=mode)
        _finalize_job_success(job, result)

        job_result = _safe_json_load(job.result_json)
        summary = None
        if job_result.get("steps"):
            step = next((s for s in job_result["steps"] if s.get("name") == "summarize"), None)
            if step and step.get("output"):
                summary = step["output"].get("summary")
        return jsonify({"job_id": job.id, "status": job.status, "result": job_result, "summary": summary})
    except Exception as exc:
        _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.post("/text/translate")
@require_auth
def text_only_translate(user):
    data = request.get_json() or {}
    raw_text = (data.get("text") or "").strip()
    target_lang = (data.get("target_lang") or "en").lower()
    source_lang = data.get("source_lang")
    if not raw_text:
        return jsonify({"error": "text is required"}), 400

    job = _create_job(user.id, JobType.TRANSLATE, None, {"target_lang": target_lang, "source_lang": source_lang}, {"text_snippet": raw_text[:1000], "created_at": _now_iso()})
    try:
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()
        db.session.commit()

        result = _init_result_struct()
        synthetic = {
            "name": "input_text",
            "status": "completed",
            "started_at": _now_iso(),
            "finished_at": _now_iso(),
            "output": {"text": raw_text},
        }
        result = _upsert_step(result, synthetic)
        job.result_json = _json_dumps(result)
        db.session.commit()

        result = _step_translate(job, None, result, target_lang=target_lang, source_lang=source_lang)
        _finalize_job_success(job, result)

        job_result = _safe_json_load(job.result_json)
        translation = None
        if job_result.get("steps"):
            step = next((s for s in job_result["steps"] if s.get("name") == "translate"), None)
            if step and step.get("output"):
                translation = step["output"].get("translation")
        return jsonify({"job_id": job.id, "status": job.status, "result": job_result, "translation": translation})
    except Exception as exc:
        _finalize_job_failure(job, _safe_json_load(job.result_json), exc)
        return jsonify({"job_id": job.id, "status": JobStatus.FAILED, "error": str(exc)}), 500


@processing_bp.get("/jobs")
@require_auth
def list_jobs(user):
    """List jobs for the current user. Optional query:
    - document_id: filter jobs for a specific document (or 'null' to fetch text-only jobs)
    - type: filter by job_type
    - limit: max items (default 100)
    """
    q = ProcessingJob.query.filter_by(user_id=user.id)
    document_id = request.args.get("document_id")
    job_type = request.args.get("type")
    limit = request.args.get("limit", type=int) or 100

    if document_id is not None:
        if document_id == "null":
            q = q.filter(ProcessingJob.document_id.is_(None))
        else:
            try:
                did = int(document_id)
                q = q.filter_by(document_id=did)
            except ValueError:
                return jsonify({"error": "invalid document_id"}), 400

    if job_type:
        q = q.filter_by(job_type=job_type)

    jobs = q.order_by(ProcessingJob.created_at.desc()).limit(limit).all()
    def _safe(obj):
        try:
            return _safe_json_load(obj)
        except Exception:
            return {}
    return jsonify([
        {
            "id": j.id,
            "type": j.job_type,
            "status": j.status,
            "document_id": j.document_id,
            "created_at": j.created_at.isoformat(),
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
            "params": _safe(j.params_json),
        }
        for j in jobs
    ])


@processing_bp.get("/documents/<int:doc_id>/jobs")
@require_auth
def list_document_jobs(user, doc_id: int):
    doc = Document.query.filter_by(id=doc_id, user_id=user.id).first()
    if not doc:
        return jsonify({"error": "not found"}), 404
    jobs = (
        ProcessingJob.query.filter_by(user_id=user.id, document_id=doc.id)
        .order_by(ProcessingJob.created_at.desc())
        .all()
    )
    return jsonify([
        {
            "id": j.id,
            "type": j.job_type,
            "status": j.status,
            "document_id": j.document_id,
            "created_at": j.created_at.isoformat(),
            "started_at": j.started_at.isoformat() if j.started_at else None,
            "finished_at": j.finished_at.isoformat() if j.finished_at else None,
        }
        for j in jobs
    ])


@processing_bp.get("/jobs/<int:job_id>")
@require_auth
def get_job(user, job_id: int):
    job = ProcessingJob.query.filter_by(id=job_id, user_id=user.id).first()
    if not job:
        return jsonify({"error": "not found"}), 404
    return jsonify(
        {
            "id": job.id,
            "type": job.job_type,
            "status": job.status,
            "document_id": job.document_id,
            "params": _safe_json_load(job.params_json),
            "input": _safe_json_load(job.input_json),
            "result": _safe_json_load(job.result_json),
            "error": job.error_message,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }
    )


@processing_bp.get("/dashboard/summary")
@require_auth
def dashboard_summary(user):
    """Return per-user dashboard summary: counts and recent items."""
    total_documents = Document.query.filter_by(user_id=user.id).count()
    total_jobs = ProcessingJob.query.filter_by(user_id=user.id).count()

    def _count(job_type: str) -> int:
        return ProcessingJob.query.filter_by(user_id=user.id, job_type=job_type).count()

    job_counts = {
        "transcribe": _count(JobType.TRANSCRIBE),
        "summarize": _count(JobType.SUMMARIZE),
        "translate": _count(JobType.TRANSLATE),
        "notes": _count(getattr(JobType, "NOTES", "notes")),
        "quiz": _count(getattr(JobType, "QUIZ", "quiz")),
        "composite": ProcessingJob.query.filter_by(user_id=user.id, job_type="composite").count(),
    }

    recent_docs = (
        Document.query.filter_by(user_id=user.id)
        .order_by(Document.created_at.desc())
        .limit(10)
        .all()
    )
    recent_documents = [
        {
            "id": d.id,
            "name": d.original_name,
            "mime_type": d.mime_type,
            "size_bytes": d.size_bytes,
            "created_at": d.created_at.isoformat(),
        }
        for d in recent_docs
    ]

    recent_jobs = (
        ProcessingJob.query.filter_by(user_id=user.id)
        .order_by(ProcessingJob.created_at.desc())
        .limit(15)
        .all()
    )
    recent_activity = [
        {
            "id": j.id,
            "type": j.job_type,
            "status": j.status,
            "created_at": j.created_at.isoformat(),
            "document_id": j.document_id,
        }
        for j in recent_jobs
    ]

    return jsonify(
        {
            "counts": {
                "documents": total_documents,
                "jobs": total_jobs,
                "jobs_by_type": job_counts,
            },
            "recent_documents": recent_documents,
            "recent_activity": recent_activity,
        }
    )