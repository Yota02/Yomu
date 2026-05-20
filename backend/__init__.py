from flask import Flask
from flask_cors import CORS

from .config import Config
from .extensions import db
from .routes import api_bp
from .services.storage import ensure_storage_dirs


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    app.config["MAX_CONTENT_LENGTH"] = Config.MAX_CONTENT_LENGTH

    CORS(app)
    db.init_app(app)
    ensure_storage_dirs()

    with app.app_context():
        db.create_all()

    app.register_blueprint(api_bp)

    return app
