import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, os.pardir))


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "TRANSLATIONS_DB_URI",
        "sqlite:///translations.db",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "100"))
    MAX_UPLOAD_PAGES = int(os.environ.get("MAX_UPLOAD_PAGES", "500"))
    EXTRACT_PAGES = int(os.environ.get("EXTRACT_PAGES", "10"))
    SSE_IDLE_TIMEOUT_SECONDS = int(os.environ.get("SSE_IDLE_TIMEOUT_SECONDS", "900"))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_SIZE_MB * 1024 * 1024

    UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, "uploads")
    OUTPUT_FOLDER = os.path.join(PROJECT_ROOT, "outputs")
