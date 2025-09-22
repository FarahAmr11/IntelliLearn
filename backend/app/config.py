import os


class Config:
    def __init__(self) -> None:
        # Load from environment if present
        from dotenv import load_dotenv
        load_dotenv()

        self.ENV = os.getenv("FLASK_ENV", "development")
        self.SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
        self.JWT_SECRET = os.getenv("JWT_SECRET", "dev-jwt-secret-change-me")

        default_db = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "instance",
            "app.db",
        )
        default_db = os.path.abspath(default_db)
        self.SQLALCHEMY_DATABASE_URI = os.getenv(
            "DATABASE_URL", f"sqlite:///{default_db}"
        )

        uploads = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "uploads"
        )
        self.UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", os.path.abspath(uploads))
        self.MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(50 * 1024 * 1024)))

        self.SQLALCHEMY_TRACK_MODIFICATIONS = False


