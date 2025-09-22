# models.py
"""
Database models including Quiz and FlashNote features.
"""

from datetime import datetime, timedelta
from .extensions import db


class TimestampMixin:
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class JobType:
    TRANSCRIBE = "transcribe"
    SUMMARIZE = "summarize"
    TRANSLATE = "translate"
    NOTES = "notes"
    QUIZ = "quiz"


class JobStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class User(db.Model, TimestampMixin):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(120), nullable=True)

    documents = db.relationship("Document", backref="user", lazy=True)
    jobs = db.relationship("ProcessingJob", backref="user", lazy=True)
    quizzes = db.relationship("Quiz", backref="creator", lazy=True)
    quiz_attempts = db.relationship("QuizAttempt", backref="user", lazy=True)
    flashnotes = db.relationship("FlashNote", backref="user", lazy=True)

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email}>"

class Document(db.Model, TimestampMixin):
    __tablename__ = "documents"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)

    # File metadata
    filename = db.Column(db.String(255), nullable=False)         # saved filename
    original_name = db.Column(db.String(255), nullable=False)    # original uploaded name
    file_path = db.Column(db.String(1024), nullable=True)        # optional absolute/relative path to file
    mime_type = db.Column(db.String(120), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False)

    # Textual fields (populated by services)
    text_content = db.Column(db.Text, nullable=True)             # ASR / extracted text
    language = db.Column(db.String(16), nullable=True, index=True)       # detected language, e.g. "en", "fr"
    summary = db.Column(db.Text, nullable=True)                  # summarizer output
    translated_text = db.Column(db.Text, nullable=True)          # translator output (target)
    source_language = db.Column(db.String(16), nullable=True, index=True) # detected source language for translation

    jobs = db.relationship("ProcessingJob", back_populates="document", lazy=True)
    quizzes = db.relationship("Quiz", backref="source_document", lazy=True)
    flashnotes = db.relationship("FlashNote", backref="source_document", lazy=True)

    def __repr__(self) -> str:
        return f"<Document id={self.id} name={self.original_name} user_id={self.user_id}>"

class ProcessingJob(db.Model, TimestampMixin):
    __tablename__ = "processing_jobs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=True)

    job_type = db.Column(db.String(32), nullable=False)
    status = db.Column(db.String(32), default=JobStatus.PENDING, nullable=False)

    # Keep params_json (optional structured params) for easy filtering/search
    params_json = db.Column(db.Text, nullable=True)

    # store the full job input (e.g., original text, request params, audio metadata)
    input_json = db.Column(db.Text, nullable=True)

    # Result / error
    result_json = db.Column(db.Text, nullable=True)
    error_message = db.Column(db.Text, nullable=True)

    # timestamps to track runtime
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)

    document = db.relationship("Document", back_populates="jobs", lazy=True)

    def __repr__(self) -> str:
        return f"<ProcessingJob id={self.id} type={self.job_type} status={self.status}>"

class PasswordResetToken(db.Model, TimestampMixin):
    __tablename__ = "password_reset_tokens"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    token = db.Column(db.String(255), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", backref="password_reset_tokens", lazy=True)

    def is_valid(self) -> bool:
        return self.used_at is None and datetime.utcnow() < self.expires_at

    @staticmethod
    def expiry_default(hours: int = 1) -> datetime:
        return datetime.utcnow() + timedelta(hours=hours)

    def __repr__(self) -> str:
        return f"<PasswordResetToken id={self.id} user_id={self.user_id}>"

# models.py (add)
class Quiz(db.Model, TimestampMixin):
    __tablename__ = "quizzes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=True)
    title = db.Column(db.String(255), nullable=True)
    description = db.Column(db.Text, nullable=True)
    question_count = db.Column(db.Integer, nullable=True)
    meta_json = db.Column(db.Text, nullable=True)   # store generation params, difficulty, etc.
    # Optionally store output summary or prompt used
    generated_at = db.Column(db.DateTime, nullable=True)

    questions = db.relationship("QuizQuestion", backref="quiz", lazy=True)

    def __repr__(self) -> str:
        return f"<Quiz id={self.id} user={self.user_id} doc={self.document_id} questions={self.question_count}>"


class QuizQuestion(db.Model):
    __tablename__ = "quiz_questions"

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quizzes.id"), nullable=False)
    ordinal = db.Column(db.Integer, nullable=False)             # 1..N
    prompt = db.Column(db.Text, nullable=False)
    options_json = db.Column(db.Text, nullable=False)           # JSON list of option strings
    answer_index = db.Column(db.Integer, nullable=False)        # index into options_json
    explanation = db.Column(db.Text, nullable=True)             # optional explanation for answer

    def __repr__(self) -> str:
        return f"<QuizQuestion id={self.id} quiz={self.quiz_id} ord={self.ordinal}>"

# models.py (append)
class QuizAttempt(db.Model, TimestampMixin):
    __tablename__ = "quiz_attempts"

    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey("quizzes.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    score = db.Column(db.Float, nullable=True)   # percentage 0..100
    total = db.Column(db.Integer, nullable=True) # total questions
    correct_count = db.Column(db.Integer, nullable=True)
    meta_json = db.Column(db.Text, nullable=True)  # e.g. time_taken, client info
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    answers = db.relationship("QuizAttemptAnswer", backref="attempt", lazy=True)

    def __repr__(self):
        return f"<QuizAttempt id={self.id} quiz={self.quiz_id} user={self.user_id} score={self.score}>"

class QuizAttemptAnswer(db.Model):
    __tablename__ = "quiz_attempt_answers"

    id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey("quiz_attempts.id"), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey("quiz_questions.id"), nullable=True)
    ordinal = db.Column(db.Integer, nullable=False)    # question ordinal (1..N)
    selected_index = db.Column(db.Integer, nullable=False)  # 0..3
    correct_index = db.Column(db.Integer, nullable=True)
    is_correct = db.Column(db.Boolean, nullable=True)
    # optional user free-text answer for non-MCQ (keeping schema flexible)
    user_text = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<QuizAttemptAnswer id={self.id} attempt={self.attempt_id} q={self.question_id} sel={self.selected_index} ok={self.is_correct}>"

class FlashNote(db.Model, TimestampMixin):
    """
    Generated flash note extracted from a document/text/audio. Each flash note is short,
    with optional tags and source metadata.
    """
    __tablename__ = "flashnotes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), nullable=True)

    title = db.Column(db.String(255), nullable=True)
    content = db.Column(db.Text, nullable=False)  # the generated flash note content (text/bullets)
    # short excerpt of source used to generate the note
    source_snippet = db.Column(db.Text, nullable=True)
    # optional tags (comma-separated) or you can store as JSON in meta_json
    tags = db.Column(db.String(255), nullable=True)
    # generation metadata (model name, params, confidence)
    meta_json = db.Column(db.Text, nullable=True)

    def __repr__(self) -> str:
        return f"<FlashNote id={self.id} user_id={self.user_id} title={self.title}>"
