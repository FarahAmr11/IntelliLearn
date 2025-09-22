from functools import wraps
from typing import Callable
from flask import request, jsonify, current_app, g
import jwt
import time
from ..models import User
import logging

logger = logging.getLogger(__name__)

# optional leeway in seconds to tolerate small clock skew between machines
JWT_LEEWAY_SECONDS = int(current_app.config.get("JWT_LEEWAY_SECONDS", 60)) if current_app else 60

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        else:
            token = request.args.get("token") or request.cookies.get("access_token")

        if not token:
            logger.debug("No token provided in request")
            return jsonify({"error": "authentication required"}), 401

        # Quick debug: show token length (do NOT log tokens in production)
        logger.debug("Received token (len=%d)", len(token))

        # Try a non-verified decode to inspect exp/iat/payload for debugging (safe for logs)
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            logger.debug("Unverified token payload: %s", {k: unverified.get(k) for k in ("sub","exp","iat","jti")})
        except Exception as ex:
            logger.debug("Unable to decode token without verification: %s", ex)
            unverified = {}

        try:
            # decode with expiration verification and a small leeway
            payload = jwt.decode(
                token,
                current_app.config["JWT_SECRET"],
                algorithms=["HS256"],
                leeway=JWT_LEEWAY_SECONDS,
            )

            # payload is valid here
            user_id = payload.get("sub")
            if user_id is None:
                logger.warning("Token missing 'sub' claim: payload=%s", payload)
                return jsonify({"error": "invalid_token", "reason": "missing sub claim"}), 401

            # fetch user
            try:
                user = User.query.filter_by(id=int(user_id)).first()
            except Exception as db_e:
                logger.exception("DB error looking up user for id=%s: %s", user_id, db_e)
                return jsonify({"error": "server_error"}), 500

            if not user:
                logger.warning("Token's sub refers to non-existent user id=%s", user_id)
                return jsonify({"error": "invalid_token", "reason": "user not found"}), 401

            # attach user for handlers
            g.current_user = user
            return f(user, *args, **kwargs)

        except jwt.ExpiredSignatureError as exc:
            # Build helpful diagnostics
            now_ts = int(time.time())
            exp_ts = None
            try:
                exp_ts = unverified.get("exp")
            except Exception:
                exp_ts = None

            msg = {
                "error": "token_expired",
                "now": now_ts,
                "token_exp": exp_ts,
                "token_exp_readable": (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(exp_ts)) if exp_ts else None),
                "leeway_seconds": JWT_LEEWAY_SECONDS,
            }
            logger.info("Token expired: %s", msg)
            return jsonify(msg), 401

        except jwt.InvalidSignatureError as exc:
            logger.warning("Invalid token signature: %s", exc)
            return jsonify({"error": "invalid_token", "reason": "invalid_signature"}), 401

        except jwt.InvalidTokenError as exc:
            logger.warning("Invalid token: %s", exc)
            return jsonify({"error": "invalid_token", "reason": str(exc)}), 401

        except Exception as exc:
            logger.exception("Unexpected error validating token: %s", exc)
            return jsonify({"error": "invalid_token", "reason": "unexpected_error"}), 401

    return wrapper
