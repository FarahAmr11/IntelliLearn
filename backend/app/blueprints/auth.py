from datetime import datetime, timedelta
import uuid
from flask import Blueprint, request, jsonify, current_app
from sqlalchemy.exc import IntegrityError
import jwt
from ..extensions import db, bcrypt
from ..models import User, PasswordResetToken


auth_bp = Blueprint("/api/auth", __name__)



def generate_jwt(user, *, expires_minutes: int = 1440) -> str:  # 24 hours for development
    now = datetime.utcnow()
    exp = now + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),   # optional: supports token revocation
    }
    token = jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")
    return token

@auth_bp.post("/signup")
def signup():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = data.get("name")

    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400

    password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(email=email, password_hash=password_hash, name=name)

    try:
        db.session.add(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "email already registered"}), 409

    token = generate_jwt(user)
    return jsonify({"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "invalid credentials"}), 401

    token = generate_jwt(user)
    return jsonify({"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}})


@auth_bp.post("/logout")
def logout():
    # Stateless JWT: client discards token
    return jsonify({"message": "logged out"})


@auth_bp.post("/forgot-password")
def forgot_password():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "email is required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        # Always respond success to prevent enumeration
        return jsonify({"message": "if the email exists, reset instructions have been sent"})

    token_str = str(uuid.uuid4())
    prt = PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=PasswordResetToken.expiry_default(hours=1),
    )
    db.session.add(prt)
    db.session.commit()

    # In real system, email the token link. For now, return token for testing.
    return jsonify({"reset_token": token_str})


@auth_bp.post("/reset-password")
def reset_password():
    data = request.get_json() or {}
    token_str = data.get("token")
    new_password = data.get("password")
    if not token_str or not new_password:
        return jsonify({"error": "token and password are required"}), 400

    prt = PasswordResetToken.query.filter_by(token=token_str).first()
    if not prt or not prt.is_valid():
        return jsonify({"error": "invalid or expired token"}), 400

    user = prt.user
    user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    prt.used_at = datetime.utcnow()
    db.session.commit()

    return jsonify({"message": "password updated"})


