import os

from ..config import Config


def ensure_storage_dirs():
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(Config.OUTPUT_FOLDER, exist_ok=True)
