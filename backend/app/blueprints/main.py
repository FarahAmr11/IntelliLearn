from flask import Blueprint, jsonify


main_bp = Blueprint("main", __name__)


@main_bp.get("/")
def home():
    return (
        "<h1>IntelliLearn API</h1><p>Backend: Flask + SQLite.</p>",
        200,
        {"Content-Type": "text/html; charset=utf-8"},
    )


@main_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


