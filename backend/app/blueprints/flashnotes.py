# app/flashnotes_bp.py
from __future__ import annotations

import json
import math
from typing import List, Optional

from flask import Blueprint, request, jsonify
from datetime import datetime

from ..extensions import db
from ..models import FlashNote, Document, ProcessingJob, JobType, JobStatus
from ..utils.auth import require_auth
from ..services import notes_builder

flashnotes_bp = Blueprint("flashnotes", __name__, url_prefix="/api")

# Helper to create a ProcessingJob record (optional) — we create a job record for traceability
def _create_job(user_id: int, job_type: str, document_id: int | None, params: dict, input_json: dict | None = None):
    job = ProcessingJob(
        user_id=user_id,
        job_type=job_type,
        document_id=document_id,
        status=JobStatus.RUNNING,
        params_json=json.dumps(params) if params else None,
        input_json=json.dumps(input_json) if input_json else None,
        started_at=datetime.utcnow(),
    )
    db.session.add(job)
    db.session.commit()
    return job

# POST /api/flashnotes
@flashnotes_bp.post("/flashnotes")
@require_auth
def create_flashnotes(user):
    """
    Create flashnotes from a document or raw text.

    JSON payload:
      - document_id   (optional) integer
      - text          (optional) string
      - count         (optional) int, default 1
      - density       (optional) "skim"|"study"|"exam", default "study"
      - title         (optional) base title for generated notes
      - force         (optional) bool, default False - if True, regenerate even if notes exist

    Returns:
      {
        "job_id": int,
        "status": "existing" | "completed",
        "created": [
           {id, title, content, source_snippet, tags, meta, created_at}, ...
        ]
      }
    """
    data = request.get_json() or {}
    document_id = data.get("document_id")
    raw_text = data.get("text")
    count = int(data.get("count") or 1)
    density = (data.get("density") or "study").lower()
    base_title = data.get("title") or None
    force = bool(data.get("force") or False)

    if not document_id and not raw_text:
        return jsonify({"error": "either document_id or text is required"}), 400

    doc = None
    if document_id:
        doc = Document.query.filter_by(id=document_id, user_id=user.id).first()
        if not doc:
            return jsonify({"error": "document not found"}), 404

        # If not forced, reuse the most recent flashnotes for this document
        if not force:
            existing_notes = FlashNote.query.filter_by(
                user_id=user.id, 
                document_id=doc.id,
                tags=density
            ).order_by(FlashNote.created_at.desc()).limit(count).all()
            
            if existing_notes:
                created_notes = []
                for note in existing_notes:
                    created_notes.append({
                        "id": note.id,
                        "title": note.title,
                        "content": note.content,
                        "source_snippet": note.source_snippet,
                        "tags": note.tags,
                        "meta": json.loads(note.meta_json or "{}"),
                        "created_at": note.created_at.isoformat(),
                    })
                
                return jsonify({
                    "job_id": None,
                    "status": "existing",
                    "created": created_notes
                })

    # Choose source text: prefer explicit text -> doc.summary -> doc.text_content
    source_text = (raw_text or (doc.summary or doc.text_content) if doc else None)
    if not source_text or not source_text.strip():
        return jsonify({"error": "no text available to generate notes; ensure document has text_content or pass text"}), 400

    # Track as a job
    job = _create_job(
        user.id,
        JobType.NOTES,
        doc.id if doc else None,
        params={"count": count, "density": density, "force": force},
        input_json={"text_snippet": source_text[:1000]},
    )

    created_notes: List[dict] = []
    try:
        # Use token-based chunking if multiple notes requested
        from app.services.notes_service import NotesService
        # notes_builder = NotesService()

        text = " ".join(source_text.split())
        if count > 1:
            # Token-based chunking for independence
            chunks = notes_builder._chunk_by_token_ids(
                text, 
                max_tokens=notes_builder.short_max_tokens // 2, 
                overlap=32
            )
            chunks = chunks[:count] if len(chunks) >= count else chunks

            for i, chunk in enumerate(chunks):
                note_md = notes_builder.make_notes(chunk, density=density)
                title = base_title or (
                    f"FlashNote {i+1} for {doc.original_name}" if doc else f"FlashNote {i+1}"
                )
                fn = FlashNote(
                    user_id=user.id,
                    document_id=doc.id if doc else None,
                    title=title,
                    content=note_md,
                    source_snippet=chunk[:500],
                    tags=density,
                    meta_json=json.dumps({
                        "density": density,
                        "chunk_index": i,
                        "created_by": "notes_service"
                    }),
                )
                db.session.add(fn)
                db.session.commit()

                created_notes.append({
                    "id": fn.id,
                    "title": fn.title,
                    "content": fn.content,
                    "source_snippet": fn.source_snippet,
                    "tags": fn.tags,
                    "meta": json.loads(fn.meta_json or "{}"),
                    "created_at": fn.created_at.isoformat(),
                })
        else:
            # Single note
            note_md = notes_builder.make_notes(text, density=density)
            title = base_title or (f"FlashNote for {doc.original_name}" if doc else "FlashNote")
            fn = FlashNote(
                user_id=user.id,
                document_id=doc.id if doc else None,
                title=title,
                content=note_md,
                source_snippet=text[:500],
                tags=density,
                meta_json=json.dumps({"density": density, "created_by": "notes_service"}),
            )
            db.session.add(fn)
            db.session.commit()
            created_notes.append({
                "id": fn.id,
                "title": fn.title,
                "content": fn.content,
                "source_snippet": fn.source_snippet,
                "tags": fn.tags,
                "meta": json.loads(fn.meta_json or "{}"),
                "created_at": fn.created_at.isoformat(),
            })

    except Exception as exc:
        job.status = JobStatus.FAILED
        job.finished_at = datetime.utcnow()
        job.error_message = str(exc)
        db.session.commit()
        return jsonify({"error": str(exc)}), 500

    job.status = JobStatus.COMPLETED
    job.finished_at = datetime.utcnow()
    job.result_json = json.dumps({"created_note_ids": [n["id"] for n in created_notes], "count": len(created_notes)})
    db.session.commit()

    return jsonify({"job_id": job.id, "status": "completed", "created": created_notes})


# GET /api/flashnotes  (list)
@flashnotes_bp.get("/flashnotes")
@require_auth
def list_flashnotes(user):
    """
    Query params:
      - document_id (optional)
      - limit (optional, default 50)
      - offset (optional)
    """
    document_id = request.args.get("document_id", type=int)
    limit = min(200, int(request.args.get("limit") or 50))
    offset = int(request.args.get("offset") or 0)

    q = FlashNote.query.filter_by(user_id=user.id)
    if document_id:
        q = q.filter_by(document_id=document_id)

    total = q.count()
    notes = q.order_by(FlashNote.created_at.desc()).limit(limit).offset(offset).all()

    out = []
    for n in notes:
        out.append({
            "id": n.id,
            "title": n.title,
            "content_snippet": (n.content[:500] + "...") if n.content and len(n.content) > 500 else n.content,
            "source_snippet": n.source_snippet,
            "tags": n.tags,
            "meta": json.loads(n.meta_json or "{}"),
            "created_at": n.created_at.isoformat(),
        })

    return jsonify({"total": total, "limit": limit, "offset": offset, "notes": out})


# GET /api/flashnotes/<id>  (retrieve single note)
@flashnotes_bp.get("/flashnotes/<int:note_id>")
@require_auth
def get_flashnote(user, note_id: int):
    note = FlashNote.query.filter_by(id=note_id, user_id=user.id).first()
    if not note:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "source_snippet": note.source_snippet,
        "tags": note.tags,
        "meta": json.loads(note.meta_json or "{}"),
        "created_at": note.created_at.isoformat(),
        "document_id": note.document_id,
    })
