import os
import socket
import re
import warnings
from datetime import datetime

import fitz
import torch
from celery import Celery
from sqlalchemy import Column, DateTime, Integer, String, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import PROJECT_ROOT
from .services.epub_service import create_epub_from_text
from .services.storage import ensure_storage_dirs
from .services.text_processing import apply_post_processing
from .services.translation_models import get_ct2_model, get_translation_model


warnings.filterwarnings("ignore", message=".*unauthenticated requests to the HF Hub.*")

db_path = os.path.join(PROJECT_ROOT, "instance", "translations.db")
if not os.path.exists(db_path):
    db_path = os.path.join(PROJECT_ROOT, "translations.db")

engine = create_engine(f"sqlite:///{db_path}")
Session = sessionmaker(bind=engine)
Base = declarative_base()


class Translation(Base):
    __tablename__ = "translation"
    id = Column(Integer, primary_key=True)
    task_id = Column(String(36), unique=True, nullable=False)
    filename = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(20), default="pending")
    total_pages = Column(Integer, default=0)
    current_page = Column(Integer, default=0)


def is_redis_available():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        sock.connect(("localhost", 6379))
        sock.close()
        return True
    except Exception:
        return False


if is_redis_available():
    print("[Celery] Redis est accessible en local. Utilisation de Redis.")
    BROKER_URL = "redis://localhost:6379/0"
    BACKEND_URL = "redis://localhost:6379/0"
else:
    print("[Celery] Redis n'est pas accessible. Utilisation de SQLite comme broker de secours.")
    BROKER_URL = f"sqla+sqlite:///{os.path.join(PROJECT_ROOT, 'celery_broker.sqlite')}"
    BACKEND_URL = f"db+sqlite:///{os.path.join(PROJECT_ROOT, 'celery_results.sqlite')}"

celery_app = Celery("translation_tasks", broker=BROKER_URL, backend=BACKEND_URL)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Paris",
    enable_utc=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True)
def translate_and_build_pdf_task(
    self,
    task_id,
    filepath,
    output_path,
    glossary,
    limit_pages=None,
    protagonist_gender="none",
    translation_mode="fast",
):
    ensure_storage_dirs()
    print(
        "[Celery Worker] Début de la traduction pour la tâche "
        f"{task_id} (Genre: {protagonist_gender}, Mode: {translation_mode})"
    )
    self.update_state(state="PROGRESS", meta={"status": "starting", "current_page": 0, "total_pages": 0})

    try:
        doc = fitz.open(filepath)
        total_pages = len(doc)
        pages_to_translate = min(limit_pages, total_pages) if limit_pages is not None else total_pages

        if translation_mode == "fast":
            tokenizer, ct2_model = get_ct2_model()
            device = "cpu"
        else:
            tokenizer, model, device = get_translation_model()

        all_translated_paragraphs = []
        original_filename = os.path.basename(filepath).replace(".pdf", "")

        for page_num in range(pages_to_translate):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]

            logical_blocks = []
            for block in blocks:
                if block["type"] == 0:
                    block_spans = []
                    block_text_parts = []
                    for line in block["lines"]:
                        for span in line["spans"]:
                            if len(span["text"].strip()) > 0:
                                block_spans.append(span)
                                block_text_parts.append(span["text"])

                    if not block_spans:
                        continue

                    block_text = " ".join(block_text_parts)
                    logical_blocks.append({"text": block_text, "spans": block_spans})

            to_translate_indices = []
            texts_to_translate = []
            for idx, blk in enumerate(logical_blocks):
                if len(blk["text"].strip()) > 2:
                    to_translate_indices.append(idx)
                    texts_to_translate.append(blk["text"])

            translated_map = {}
            if texts_to_translate:
                if translation_mode == "fast":
                    source_tokens_list = [
                        tokenizer.convert_ids_to_tokens(tokenizer.encode(text))
                        for text in texts_to_translate
                    ]
                    results = ct2_model.translate_batch(source_tokens_list, beam_size=4)
                    translated_texts = [
                        tokenizer.decode(
                            tokenizer.convert_tokens_to_ids(result.hypotheses[0]),
                            skip_special_tokens=True,
                        )
                        for result in results
                    ]
                else:
                    inputs = tokenizer(
                        texts_to_translate,
                        return_tensors="pt",
                        padding=True,
                        truncation=True,
                    ).to(device)
                    with torch.no_grad():
                        outputs = model.generate(**inputs, max_length=512)
                    translated_texts = tokenizer.batch_decode(outputs, skip_special_tokens=True)

                for i, orig_idx in enumerate(to_translate_indices):
                    translated_text = translated_texts[i]
                    original_text = texts_to_translate[i]

                    for item in glossary:
                        if item.get("translation", "").strip():
                            pattern = re.compile(re.escape(item["original"]), re.IGNORECASE)
                            translated_text = pattern.sub(item["translation"], translated_text)

                    translated_text = apply_post_processing(original_text, translated_text)

                    translated_map[orig_idx] = translated_text
                    all_translated_paragraphs.append(translated_text)

            for idx, blk in enumerate(logical_blocks):
                if idx in translated_map:
                    translated_text = translated_map[idx]
                    spans = blk["spans"]

                    union_rect = fitz.Rect(spans[0]["bbox"])
                    for span in spans[1:]:
                        union_rect = union_rect | fitz.Rect(span["bbox"])

                    for span in spans:
                        page.add_redact_annot(fitz.Rect(span["bbox"]), fill=(1, 1, 1))
                    page.apply_redactions()

                    avg_fontsize = sum(span["size"] for span in spans) / len(spans)
                    fontsize = avg_fontsize

                    target_rect = fitz.Rect(
                        union_rect.x0,
                        union_rect.y0,
                        union_rect.x1 + 20,
                        union_rect.y1 + 15,
                    )

                    inserted = False
                    while fontsize >= 4:
                        res = page.insert_textbox(
                            target_rect,
                            translated_text,
                            fontsize=fontsize,
                            fontname="helv",
                            color=fitz.utils.getColor("black"),
                        )
                        if res >= 0:
                            inserted = True
                            break
                        fontsize -= 0.5

                    if not inserted:
                        page.insert_textbox(
                            target_rect,
                            translated_text,
                            fontsize=4,
                            fontname="helv",
                            color=fitz.utils.getColor("black"),
                        )

            try:
                pix = page.get_pixmap(dpi=120)
                temp_png_path = os.path.join(
                    os.path.dirname(output_path),
                    f"{task_id}_page_{page_num + 1}.png",
                )
                pix.save(temp_png_path)
            except Exception as render_err:
                print(f"[Celery Worker] Erreur de rendu PNG page {page_num + 1}: {render_err}")

            self.update_state(
                state="PROGRESS",
                meta={
                    "status": "processing",
                    "current_page": page_num + 1,
                    "total_pages": pages_to_translate,
                },
            )
            print(f"[Celery Worker] Page {page_num + 1}/{pages_to_translate} traduite pour {task_id}")

            if self.request.called_directly is False and self.request.is_revoked:
                print(f"[Celery Worker] Tache annulee pour {task_id}")
                doc.close()
                return {
                    "status": "cancelled",
                    "current_page": page_num + 1,
                    "total_pages": pages_to_translate,
                }

        doc.save(output_path, garbage=4, deflate=True)
        doc.close()

        epub_path = output_path.replace(".pdf", ".epub")
        create_epub_from_text(task_id, original_filename, all_translated_paragraphs, epub_path)

        print(f"[Celery Worker] Traduction terminée pour la tâche {task_id}")
        return {
            "status": "completed",
            "current_page": pages_to_translate,
            "total_pages": pages_to_translate,
            "download_url": f"/download/{task_id}",
            "epub_url": f"/download_epub/{task_id}",
        }

    except Exception as exc:
        print(f"[Celery Worker] Erreur dans la tâche {task_id}: {exc}")
        self.update_state(state="FAILURE", meta={"status": "error", "message": str(exc)})
        raise
