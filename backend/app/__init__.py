from flask import Flask
from .config import Config
from .extensions import db, bcrypt, cors


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)

    app.config.from_object(Config())
    if test_config:
        app.config.update(test_config)

    # Ensure instance and upload folders exist
    try:
        import os
        os.makedirs(app.instance_path, exist_ok=True)
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    except OSError:
        pass

    # Extensions
    db.init_app(app)
    bcrypt.init_app(app)

    # Relaxed CORS for development: allow any origin and headers on /api/* and /health
    cors.init_app(
        app,
        resources={
            r"/api/*": {"origins": "*"},
            r"/health": {"origins": "*"}
        },
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
        expose_headers=["*"],
        methods=["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
    )

    # Blueprints
    from .blueprints.auth import auth_bp
    from .blueprints.documents import documents_bp
    from .blueprints.processing import processing_bp
    from .blueprints.main import main_bp
    from .blueprints.flashnotes import flashnotes_bp
    from .blueprints.quiz import quiz_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(documents_bp, url_prefix="/api/documents")
    app.register_blueprint(processing_bp, url_prefix="/api")
    app.register_blueprint(flashnotes_bp, url_prefix="/api")
    app.register_blueprint(quiz_bp, url_prefix="/api")

    # Added to check if import is possible and also pulling all the required modul
    from .services import summarizer, transcriber, translator

    # CLI command to init DB
    @app.cli.command("init-db")
    def init_db_command():
        """Initialize the database tables."""
        with app.app_context():
            db.create_all()
        print("Initialized the database.")
    
    return app


