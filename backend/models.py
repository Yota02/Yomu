from datetime import datetime

from .extensions import db


class Translation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.String(36), unique=True, nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default="pending")
    total_pages = db.Column(db.Integer, default=0)
    current_page = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "filename": self.filename,
            "created_at": self.created_at.isoformat(),
            "status": self.status,
            "total_pages": self.total_pages,
            "current_page": self.current_page,
            "download_url": f"/download/{self.task_id}",
            "epub_url": f"/download_epub/{self.task_id}",
            "original_url": f"/download_original/{self.task_id}",
        }
