import os
import re
import time

import fitz
import torch

from ..models import Translation
from ..state import tasks, translation_lock, translation_model_lock
from .epub_service import create_epub_from_text
from .storage import ensure_storage_dirs
from .text_processing import apply_post_processing
from .translation_models import get_ct2_model, get_translation_model


def translate_and_build_pdf_fallback(
    task_id,
    filepath,
    output_path,
    glossary,
    limit_pages=None,
    protagonist_gender="none",
    translation_mode="fast",
):
    ensure_storage_dirs()
    tasks[task_id] = {
        "status": "starting",
        "current_page": 0,
        "total_pages": 0,
        "message": "En attente du modèle ou d'une autre traduction...",
    }

    translation_lock.acquire()
    try:
        from flask import current_app
        from ..extensions import db

        with current_app.app_context():
            trans = Translation.query.filter_by(task_id=task_id).first()
            if trans:
                trans.status = "processing"
                db.session.commit()

        doc = fitz.open(filepath)
        total_pages = len(doc)
        pages_to_translate = min(limit_pages, total_pages) if limit_pages is not None else total_pages

        if translation_mode == "fast":
            tokenizer, ct2_model = get_ct2_model()
            device = "cpu"
        else:
            translation_model_lock.acquire()
            tokenizer, model, device = get_translation_model()

        all_translated_paragraphs = []
        original_filename = os.path.basename(filepath).replace(".pdf", "")

        for page_num in range(pages_to_translate):
            if tasks.get(task_id, {}).get("cancel_requested"):
                tasks[task_id] = {
                    "status": "cancelled",
                    "current_page": page_num,
                    "total_pages": pages_to_translate,
                    "updated_at": time.time(),
                }
                with current_app.app_context():
                    trans = Translation.query.filter_by(task_id=task_id).first()
                    if trans:
                        trans.status = "cancelled"
                        trans.current_page = page_num
                        db.session.commit()
                doc.close()
                return

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
                print(f"Erreur de rendu de page temporaire {page_num + 1}: {render_err}")

            tasks[task_id] = {
                "status": "processing",
                "current_page": page_num + 1,
                "total_pages": pages_to_translate,
                "updated_at": time.time(),
            }

            if (page_num + 1) % 5 == 0 or (page_num + 1) == pages_to_translate:
                with current_app.app_context():
                    trans = Translation.query.filter_by(task_id=task_id).first()
                    if trans:
                        trans.current_page = page_num + 1
                        db.session.commit()

        doc.save(output_path, garbage=4, deflate=True)
        doc.close()

        epub_path = output_path.replace(".pdf", ".epub")
        create_epub_from_text(task_id, original_filename, all_translated_paragraphs, epub_path)

        with current_app.app_context():
            trans = Translation.query.filter_by(task_id=task_id).first()
            if trans:
                trans.status = "completed"
                trans.current_page = pages_to_translate
                db.session.commit()

        tasks[task_id] = {
            "status": "completed",
            "current_page": pages_to_translate,
            "total_pages": pages_to_translate,
            "download_url": f"/download/{task_id}",
            "epub_url": f"/download_epub/{task_id}",
            "updated_at": time.time(),
        }

    except Exception as exc:
        print(f"Erreur de traitement: {exc}")
        from flask import current_app
        from ..extensions import db

        with current_app.app_context():
            trans = Translation.query.filter_by(task_id=task_id).first()
            if trans:
                trans.status = "error"
                db.session.commit()
        tasks[task_id] = {
            "status": "error",
            "message": str(exc),
            "updated_at": time.time(),
        }
    finally:
        if translation_mode != "fast":
            try:
                translation_model_lock.release()
            except Exception:
                pass
        translation_lock.release()
