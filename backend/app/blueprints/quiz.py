# app/quiz_bp.py
from __future__ import annotations

import json
from datetime import datetime
from typing import List, Dict, Any

from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models import (
    Quiz, QuizQuestion, QuizAttempt, QuizAttemptAnswer,
    Document, ProcessingJob, JobType, JobStatus
)
from ..utils.auth import require_auth
from ..services import quiz_builder

quiz_bp = Blueprint("quiz", __name__, url_prefix="/api")

# helper to create job (same pattern)
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

# -------------------------
# POST /api/quizzes  (generate)
# -------------------------
@quiz_bp.post("/quizzes")
@require_auth
def create_quiz(user):
    """
    Generate a quiz from a document or raw text.
    JSON body:
      - document_id (optional)
      - text (optional)
      - num_questions (optional, default uses service default)
      - difficulty (optional)
      - title (optional)
      - force (optional bool) — if false and a quiz exists for the document, reuse it
    """
    data = request.get_json() or {}
    document_id = data.get("document_id")
    raw_text = data.get("text")
    num_questions = int(data.get("num_questions") or 0)
    difficulty = data.get("difficulty") or "medium"
    title = data.get("title")
    force = bool(data.get("force") or False)

    doc = None
    if document_id:
        doc = Document.query.filter_by(id=document_id, user_id=user.id).first()
        if not doc:
            return jsonify({"error": "document not found"}), 404

        # If not forced, reuse the most recent quiz for this document
        if not force:
            existing = Quiz.query.filter_by(user_id=user.id, document_id=doc.id).order_by(Quiz.generated_at.desc()).first()
            if existing:
                return jsonify({
                    "job_id": None,
                    "status": "existing",
                    "quiz": {"id": existing.id, "title": existing.title, "question_count": existing.question_count}
                })

    source_text = raw_text or (doc.summary or doc.text_content if doc else None)
    if not source_text or not source_text.strip():
        return jsonify({"error": "no text available; provide document or text"}), 400

    job = _create_job(user.id, JobType.QUIZ, doc.id if doc else None,
                      params={"num_questions": num_questions, "difficulty": difficulty, "force": force},
                      input_json={"text_snippet": source_text[:1000]})

    try:
        out = quiz_builder.generate_quiz(source_text, num_questions if num_questions > 0 else None, difficulty=difficulty)
        questions = out.get("questions", [])
        raw = out.get("raw", "")

        # persist quiz
        quiz = Quiz(
            user_id=user.id,
            document_id=doc.id if doc else None,
            title=title or (f"Quiz for {doc.original_name}" if doc else "Generated Quiz"),
            description=f"Auto-generated ({len(questions)} questions)",
            question_count=len(questions),
            meta_json=json.dumps({"difficulty": difficulty}),
            generated_at=datetime.utcnow(),
        )
        db.session.add(quiz)
        db.session.commit()

        # persist questions
        for idx, q in enumerate(questions, start=1):
            qq = QuizQuestion(
                quiz_id=quiz.id,
                ordinal=idx,
                prompt=q.get("prompt", "")[:2000],
                options_json=json.dumps(q.get("options", [])),
                answer_index=int(q.get("answer_index", 0)),
                explanation=q.get("explanation", "") or ""
            )
            db.session.add(qq)
        db.session.commit()

        # finalize job
        job.status = JobStatus.COMPLETED
        job.finished_at = datetime.utcnow()
        job.result_json = json.dumps({"quiz_id": quiz.id, "count": len(questions), "raw": raw})
        db.session.commit()

        return jsonify({"job_id": job.id, "status": job.status, "quiz": {"id": quiz.id, "title": quiz.title, "question_count": quiz.question_count}})
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.finished_at = datetime.utcnow()
        job.error_message = str(exc)
        db.session.commit()
        return jsonify({"error": str(exc)}), 500

# -------------------------
# GET /api/quizzes  (list user's quizzes; optional document_id filter)
# -------------------------
@quiz_bp.get("/quizzes")
@require_auth
def list_quizzes(user):
    document_id = request.args.get("document_id", type=int)
    limit = min(200, int(request.args.get("limit") or 50))
    offset = int(request.args.get("offset") or 0)

    q = Quiz.query.filter_by(user_id=user.id)
    if document_id:
        q = q.filter_by(document_id=document_id)

    total = q.count()
    quizzes = q.order_by(Quiz.generated_at.desc()).limit(limit).offset(offset).all()

    out = []
    for quiz in quizzes:
        out.append({
            "id": quiz.id,
            "title": quiz.title,
            "document_id": quiz.document_id,
            "question_count": quiz.question_count,
            "generated_at": quiz.generated_at.isoformat() if quiz.generated_at else None,
            "meta": json.loads(quiz.meta_json or "{}"),
        })

    return jsonify({"total": total, "limit": limit, "offset": offset, "quizzes": out})

# -------------------------
# GET /api/quizzes/<quiz_id>  (get quiz + questions)
# -------------------------
@quiz_bp.get("/quizzes/<int:quiz_id>")
@require_auth
def get_quiz(user, quiz_id: int):
    quiz = Quiz.query.filter_by(id=quiz_id, user_id=user.id).first()
    if not quiz:
        return jsonify({"error": "not found"}), 404
    questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).order_by(QuizQuestion.ordinal).all()
    return jsonify({
        "id": quiz.id,
        "title": quiz.title,
        "description": quiz.description,
        "document_id": quiz.document_id,
        "question_count": quiz.question_count,
        "meta": json.loads(quiz.meta_json or "{}"),
        "questions": [
            {
                "id": q.id,
                "ordinal": q.ordinal,
                "prompt": q.prompt,
                "options": json.loads(q.options_json or "[]"),
                # Do NOT expose answer_index by default — include only if requestor is owner (they are).
                "answer_index": q.answer_index,
                "explanation": q.explanation,
            }
            for q in questions
        ],
    })

# -------------------------
# POST /api/quizzes/<quiz_id>/attempt  (submit answers)
# -------------------------
@quiz_bp.post("/quizzes/<int:quiz_id>/attempt")
@require_auth
def attempt_quiz(user, quiz_id: int):
    """
    Request JSON:
      { "answers": [ {"ordinal":1, "selected_index": 2}, ... ], "meta": {...} }

    Response:
      { "attempt_id": ..., "score": 83.3, "correct": 10, "total": 12, "per_question": [...] }
    """
    payload = request.get_json() or {}
    answers = payload.get("answers") or []
    meta = payload.get("meta") or {}

    quiz = Quiz.query.filter_by(id=quiz_id).first()
    if not quiz:
        return jsonify({"error": "quiz not found"}), 404

    # load questions map by ordinal
    questions = QuizQuestion.query.filter_by(quiz_id=quiz.id).all()
    qmap = {q.ordinal: q for q in questions}
    total = len(questions)
    if total == 0:
        return jsonify({"error": "quiz has no questions"}), 400

    # create attempt
    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        total=total,
        correct_count=0,
        score=0.0,
        meta_json=json.dumps(meta),
        created_at=datetime.utcnow(),
    )
    db.session.add(attempt)
    db.session.commit()

    correct = 0
    per_q = []

    # iterate answers; allow missing answers (treated incorrect)
    for ans in answers:
        ordinal = int(ans.get("ordinal"))
        sel = int(ans.get("selected_index"))
        q = qmap.get(ordinal)
        if not q:
            # store attempted but invalid question ordinal
            qa = QuizAttemptAnswer(
                attempt_id=attempt.id, question_id=None, ordinal=ordinal,
                selected_index=sel, correct_index=None, is_correct=False, user_text=ans.get("user_text")
            )
            db.session.add(qa)
            per_q.append({"ordinal": ordinal, "selected_index": sel, "is_correct": False, "correct_index": None})
            continue

        correct_idx = int(q.answer_index)
        is_ok = (sel == correct_idx)
        if is_ok:
            correct += 1

        qa = QuizAttemptAnswer(
            attempt_id=attempt.id,
            question_id=q.id,
            ordinal=ordinal,
            selected_index=sel,
            correct_index=correct_idx,
            is_correct=is_ok,
            user_text=ans.get("user_text")
        )
        db.session.add(qa)
        per_q.append({
            "ordinal": ordinal,
            "selected_index": sel,
            "is_correct": is_ok,
            "correct_index": correct_idx,
            "explanation": q.explanation or ""
        })

    db.session.commit()

    # finalize attempt
    attempt.correct_count = correct
    attempt.score = round((correct / total) * 100.0, 2)
    db.session.commit()

    return jsonify({
        "attempt_id": attempt.id,
        "quiz_id": quiz.id,
        "score": attempt.score,
        "correct": attempt.correct_count,
        "total": total,
        "per_question": per_q,
        "created_at": attempt.created_at.isoformat(),
    })

# -------------------------
# GET /api/quizzes/<quiz_id>/attempts  (list attempts)
# -------------------------
@quiz_bp.get("/quizzes/<int:quiz_id>/attempts")
@require_auth
def list_attempts(user, quiz_id: int):
    quiz = Quiz.query.filter_by(id=quiz_id, user_id=user.id).first()
    if not quiz:
        return jsonify({"error": "not found"}), 404
    attempts = QuizAttempt.query.filter_by(quiz_id=quiz.id).order_by(QuizAttempt.created_at.desc()).all()
    out = []
    for a in attempts:
        out.append({
            "id": a.id,
            "score": a.score,
            "correct": a.correct_count,
            "total": a.total,
            "meta": json.loads(a.meta_json or "{}"),
            "created_at": a.created_at.isoformat(),
        })
    return jsonify({"attempts": out})

# -------------------------
# GET /api/quizzes/<quiz_id>/attempts/<attempt_id>  (attempt detail)
# -------------------------
@quiz_bp.get("/quizzes/<int:quiz_id>/attempts/<int:attempt_id>")
@require_auth
def get_attempt(user, quiz_id: int, attempt_id: int):
    quiz = Quiz.query.filter_by(id=quiz_id).first()
    if not quiz:
        return jsonify({"error": "quiz not found"}), 404

    attempt = QuizAttempt.query.filter_by(id=attempt_id, quiz_id=quiz.id, user_id=user.id).first()
    if not attempt:
        return jsonify({"error": "attempt not found"}), 404

    answers = QuizAttemptAnswer.query.filter_by(attempt_id=attempt.id).order_by(QuizAttemptAnswer.ordinal).all()
    per_q = []
    for a in answers:
        per_q.append({
            "ordinal": a.ordinal,
            "question_id": a.question_id,
            "selected_index": a.selected_index,
            "correct_index": a.correct_index,
            "is_correct": a.is_correct,
            "user_text": a.user_text,
        })

    return jsonify({
        "attempt": {
            "id": attempt.id,
            "quiz_id": attempt.quiz_id,
            "score": attempt.score,
            "correct": attempt.correct_count,
            "total": attempt.total,
            "meta": json.loads(attempt.meta_json or "{}"),
            "created_at": attempt.created_at.isoformat(),
            "answers": per_q,
        }
    })
