# documents_bp.py
import json
import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
from ..extensions import db
from ..models import Document, ProcessingJob, JobType, JobStatus
from ..utils.auth import require_auth
from ..utils.extract import extract_text_from_file

documents_bp = Blueprint("documents", __name__)

# Allowed: PDF, DOCX, TXT, and audio/video containers we will accept for transcription.
ALLOWED_EXTENSIONS = {
    # Documents
    "pdf", "docx", "txt",
    # Audio formats
    "mp3", "wav", "m4a", "aac", "flac", "ogg", "wma", "aiff", "au",
    # Video formats (for audio extraction)
    "mp4", "mov", "avi", "mkv", "webm", "m4v"
}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _get_audio_mime_type(ext: str) -> str:
    """Get appropriate MIME type for audio files based on extension."""
    audio_mime_types = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "wma": "audio/x-ms-wma",
        "aiff": "audio/aiff",
        "au": "audio/basic",
        "mp4": "video/mp4",
        "mov": "video/quicktime",
        "avi": "video/x-msvideo",
        "mkv": "video/x-matroska",
        "webm": "video/webm",
        "m4v": "video/x-m4v"
    }
    return audio_mime_types.get(ext.lower(), "application/octet-stream")


def _get_max_upload_bytes() -> int:
    """
    Determine maximum upload bytes. Flask's MAX_CONTENT_LENGTH is respected automatically if set,
    but we still perform an explicit check as a defensive measure.
    """
    # First prefer Flask's MAX_CONTENT_LENGTH if set
    max_bytes = current_app.config.get("MAX_CONTENT_LENGTH")
    if isinstance(max_bytes, int):
        return max_bytes
    # Fallback to our explicit config (default 50 MB)
    return int(current_app.config.get("MAX_UPLOAD_SIZE_BYTES", 50 * 1024 * 1024))


@documents_bp.get("")
@require_auth
def list_documents(user):
    docs = (
        Document.query.filter_by(user_id=user.id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return jsonify(
        [
            {
                "id": d.id,
                "original_name": d.original_name,
                "filename": d.filename,
                "file_path": d.file_path,
                "mime_type": d.mime_type,
                "size_bytes": d.size_bytes,
                "created_at": d.created_at.isoformat(),
            }
            for d in docs
        ]
    )


@documents_bp.post("/upload")
@require_auth
def upload_document(user):
    """
    Upload a document or audio/video file and store metadata.
    
    Supported formats:
    - Documents: PDF, DOCX, TXT (text extracted immediately)
    - Audio: MP3, WAV, M4A, AAC, FLAC, OGG, WMA, AIFF, AU
    - Video: MP4, MOV, AVI, MKV, WEBM, M4V (audio extracted for transcription)
    
    - For documents: extract text immediately and save as Document.text_content.
    - For audio/video: create a PENDING transcribe ProcessingJob for workers to process.
    """
    # Basic request validation
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "no selected file"}), 400

    filename = file.filename
    if not allowed_file(filename):
        return jsonify({"error": "file type not allowed"}), 400

    # Defensive size check: use seek/tell to determine file length
    file.stream.seek(0, os.SEEK_END)
    file_size = file.stream.tell()
    file.stream.seek(0)

    max_bytes = _get_max_upload_bytes()
    if file_size > max_bytes:
        return jsonify({"error": "file too large", "max_bytes": max_bytes}), 413

    # Ensure upload folder exists
    upload_folder = current_app.config.get("UPLOAD_FOLDER")
    if not upload_folder:
        return jsonify({"error": "upload folder not configured"}), 500
    os.makedirs(upload_folder, exist_ok=True)

    # Build a safe, unique storage name
    safe_name = secure_filename(filename)
    unique_token = uuid.uuid4().hex
    storage_name = f"{user.id}_{unique_token}_{safe_name}"
    save_path = os.path.join(upload_folder, storage_name)

    try:
        file.save(save_path)
    except Exception as exc:
        current_app.logger.exception("Failed to save uploaded file: %s", exc)
        return jsonify({"error": "failed to save file"}), 500

    # Attempt to extract text for document types, otherwise treat as audio/video
    ext = filename.rsplit(".", 1)[1].lower()
    document_extensions = {"pdf", "docx", "txt"}
    audio_video_extensions = {"mp3", "wav", "m4a", "aac", "flac", "ogg", "wma", "aiff", "au", "mp4", "mov", "avi", "mkv", "webm", "m4v"}
    is_document = ext in document_extensions
    is_audio_video = ext in audio_video_extensions
    text_content = None
    
    # Set appropriate MIME type
    if is_audio_video:
        mime_type = _get_audio_mime_type(ext)
    else:
        mime_type = file.mimetype or "application/octet-stream"

    if is_document:
        try:
            # extract_text_from_file should return (text_content, mime_type)
            text_content, mime_type = extract_text_from_file(save_path, filename)
            # normalize empty string to None
            if text_content is not None and text_content.strip() == "":
                text_content = None
        except Exception as exc:
            # Extraction failed; log and continue — keep text_content None
            current_app.logger.exception("Text extraction failed for %s: %s", save_path, exc)
            text_content = None

    # Persist Document record
    doc = Document(
        user_id=user.id,
        filename=storage_name,
        original_name=filename,
        file_path=save_path,
        mime_type=mime_type,
        size_bytes=file_size,
        text_content=text_content,
    )
    db.session.add(doc)
    db.session.flush()  # assign id without committing yet

    # Create an ingest/transcribe job depending on file type:
    # - documents: create an 'ingest' job (completed) that records extraction result
    # - audio/video: create a TRANSCRIBE job in PENDING state for workers to process
    try:
        if is_document:
            # Ingest job — finished, storing extracted text in result_json (if any)
            pj = ProcessingJob(
                user_id=user.id,
                document_id=doc.id,
                job_type="ingest",
                status=JobStatus.COMPLETED,
                params_json=json.dumps({"source": "upload", "ext": ext}),
                input_json=json.dumps({"filename": filename, "file_path": save_path}),
                result_json=json.dumps({"text": text_content or "", "mime_type": mime_type}),
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
            )
            db.session.add(pj)
        elif is_audio_video:
            # Audio/video: schedule a transcribe job for workers (PENDING)
            pj = ProcessingJob(
                user_id=user.id,
                document_id=doc.id,
                job_type=JobType.TRANSCRIBE,
                status=JobStatus.PENDING,
                params_json=json.dumps({"source": "upload", "ext": ext}),
                input_json=json.dumps({"filename": filename, "file_path": save_path}),
            )
            db.session.add(pj)
        else:
            # Unknown file type - create a basic ingest job
            pj = ProcessingJob(
                user_id=user.id,
                document_id=doc.id,
                job_type="ingest",
                status=JobStatus.COMPLETED,
                params_json=json.dumps({"source": "upload", "ext": ext}),
                input_json=json.dumps({"filename": filename, "file_path": save_path}),
                result_json=json.dumps({"text": "", "mime_type": mime_type}),
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
            )
            db.session.add(pj)

        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("Failed to create processing job: %s", exc)
        # Attempt to clean up saved file to avoid orphaned uploads
        try:
            os.remove(save_path)
        except Exception:
            pass
        return jsonify({"error": "failed to record upload"}), 500

    # Response to client
    return (
        jsonify(
            {
                "id": doc.id,
                "original_name": doc.original_name,
                "mime_type": doc.mime_type,
                "size_bytes": doc.size_bytes,
                "text_content": doc.text_content or "",
                "job_id": pj.id,
            }
        ),
        201,
    )


@documents_bp.get("/<int:doc_id>")
@require_auth
def get_document(user, doc_id: int):
    doc = Document.query.filter_by(id=doc_id, user_id=user.id).first()
    if not doc:
        return jsonify({"error": "not found"}), 404
    return jsonify(
        {
            "id": doc.id,
            "original_name": doc.original_name,
            "filename": doc.filename,
            "file_path": doc.file_path,
            "mime_type": doc.mime_type,
            "size_bytes": doc.size_bytes,
            "text_content": doc.text_content,
            "summary": doc.summary,
            "translated_text": doc.translated_text,
            "language": doc.language,
            "created_at": doc.created_at.isoformat(),
        }
    )


@documents_bp.delete("/<int:doc_id>")
@require_auth
def delete_document(user, doc_id: int):
    doc = Document.query.filter_by(id=doc_id, user_id=user.id).first()
    if not doc:
        return jsonify({"error": "not found"}), 404

    # Try to delete file on disk
    if doc.file_path:
        try:
            os.remove(doc.file_path)
        except FileNotFoundError:
            pass
        except Exception:
            current_app.logger.exception("Failed to remove file %s", doc.file_path)

    # Delete DB record
    db.session.delete(doc)
    db.session.commit()
    return jsonify({"message": "deleted"})


@documents_bp.get("/download/<int:doc_id>")
@require_auth
def download_document(user, doc_id: int):
    doc = Document.query.filter_by(id=doc_id, user_id=user.id).first()
    if not doc:
        return jsonify({"error": "not found"}), 404
    # Ensure file exists
    if not doc.file_path or not os.path.exists(doc.file_path):
        return jsonify({"error": "file not available"}), 404
    # send_from_directory uses directory + filename; use file_path to split them
    directory, filename = os.path.split(doc.file_path)
    return send_from_directory(directory, filename, as_attachment=True)
