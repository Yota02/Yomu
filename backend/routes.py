import json
import os
import time
import uuid

import fitz
from flask import Blueprint, Response, jsonify, request, send_file

from .config import Config
from .services.storage import ensure_storage_dirs
from .extensions import db
from .models import Translation
from .state import tasks
from .services.text_processing import extract_light_novel_terms
from .services.translation_service import translate_and_build_pdf_fallback


api_bp = Blueprint("api", __name__)


@api_bp.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "timestamp": time.time()})


@api_bp.route("/ereaders", methods=["GET"])
def list_ereaders():
    from .services.ereader_service import detect_ereaders

    ereaders = detect_ereaders()
    return jsonify(ereaders)


@api_bp.route("/ereaders/send", methods=["POST"])
def send_to_ereader():
    data = request.json or {}
    ereader_path = data.get("ereader_path")
    task_id = data.get("task_id")
    original = data.get("original", False)
    compressed = data.get("compressed", False)

    if not ereader_path or not task_id:
        return jsonify({"error": "Paramètres manquants"}), 400

    epub_path = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.epub")
    if compressed:
        comp = os.path.join(
            Config.OUTPUT_FOLDER, f"{task_id}_translated_compressed.epub"
        )
        img = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_images.epub")
        if os.path.exists(comp):
            epub_path = comp
        elif os.path.exists(img):
            epub_path = img
    elif original:
        epub_path = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_original.epub")
        if not os.path.exists(epub_path):
            pdf_path = os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf")
            if not os.path.exists(pdf_path):
                return jsonify({"error": "Fichier source introuvable"}), 404
            from .services.pdf_to_epub_service import convert_pdf_to_epub

            convert_pdf_to_epub(task_id, pdf_path, epub_path)

    from .services.ereader_service import send_to_ereader as send_epub

    success, message = send_epub(ereader_path, epub_path)
    if not success:
        return jsonify({"error": message}), 500
    return jsonify({"success": True, "message": message})


@api_bp.route("/convert_pdf_to_epub", methods=["POST"])
def convert_pdf_to_epub_endpoint():
    data = request.json or {}
    task_id = data.get("task_id")
    if not task_id:
        return jsonify({"error": "task_id manquant"}), 400

    pdf_path = os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf")
    if not os.path.exists(pdf_path):
        return jsonify({"error": "Fichier PDF introuvable"}), 404

    epub_path = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_original.epub")
    if not os.path.exists(epub_path):
        from .services.pdf_to_epub_service import convert_pdf_to_epub

        try:
            convert_pdf_to_epub(task_id, pdf_path, epub_path)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"success": True, "epub_url": f"/download_original_epub/{task_id}"})


@api_bp.route("/download_original_epub/<task_id>", methods=["GET"])
def download_original_epub(task_id):
    epub_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_original.epub")
    )
    if not os.path.exists(epub_path):
        return jsonify({"error": "EPUB original non trouvé"}), 404
    return send_file(epub_path, as_attachment=True)


@api_bp.route("/download_epub/<task_id>", methods=["GET"])
def download_epub(task_id):
    output_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.epub")
    )
    if not os.path.exists(output_path):
        return jsonify({"error": "Fichier EPUB non trouvé"}), 404
    return send_file(output_path, as_attachment=True)


@api_bp.route("/download_image_epub/<task_id>", methods=["GET"])
def download_image_epub(task_id):
    path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_images.epub")
    )
    if not os.path.exists(path):
        path = os.path.abspath(
            os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_compressed.epub")
        )
    if not os.path.exists(path):
        return jsonify({"error": "EPUB imagé non trouvé"}), 404
    return send_file(path, as_attachment=True)


@api_bp.route("/epub/preview/<task_id>", methods=["GET"])
def epub_preview(task_id):
    quality = request.args.get("quality", 85, type=int)
    dpi = request.args.get("dpi", 72, type=int)
    grayscale = request.args.get("grayscale", "0") == "1"
    page_num = request.args.get("page", "auto")

    pdf_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")
    )
    if not os.path.exists(pdf_path):
        pdf_path = os.path.abspath(os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf"))
    if not os.path.exists(pdf_path):
        return jsonify({"error": "Fichier PDF introuvable"}), 404

    try:
        doc = fitz.open(pdf_path)
        total = len(doc)
        if page_num == "auto":
            page_num = min(max(11, int(total * 0.4)), total)
        page_num = max(1, min(page_num, total))
        doc.close()

        from .services.epub_service import preview_page_from_pdf

        img_bytes = preview_page_from_pdf(
            pdf_path, page_num, dpi=dpi, jpeg_quality=quality, grayscale=grayscale
        )
        return Response(img_bytes, mimetype="image/jpeg")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/epub/estimate/<task_id>", methods=["GET"])
def epub_estimate(task_id):
    quality = request.args.get("quality", 85, type=int)
    dpi = request.args.get("dpi", 72, type=int)
    grayscale = request.args.get("grayscale", "0") == "1"

    pdf_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")
    )
    if not os.path.exists(pdf_path):
        pdf_path = os.path.abspath(os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf"))
    if not os.path.exists(pdf_path):
        return jsonify({"error": "Fichier PDF introuvable"}), 404

    try:
        doc = fitz.open(pdf_path)
        total_pages = len(doc)
        doc.close()

        from .services.epub_service import estimate_image_epub_size

        estimated = estimate_image_epub_size(
            pdf_path, total_pages, dpi=dpi, jpeg_quality=quality, grayscale=grayscale
        )
        return jsonify({"estimated_size": estimated, "total_pages": total_pages})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/epub/compress/<task_id>", methods=["POST"])
def epub_compress(task_id):
    data = request.json or {}
    quality = data.get("quality", 85)
    dpi = data.get("dpi", 72)
    grayscale = data.get("grayscale", False)

    pdf_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")
    )
    if not os.path.exists(pdf_path):
        pdf_path = os.path.abspath(os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf"))
    if not os.path.exists(pdf_path):
        return jsonify({"error": "Fichier PDF introuvable"}), 404

    epub_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_images.epub")
    )
    ref_path = epub_path.replace("_images.epub", "_images_ref.epub")

    from .services.epub_service import build_image_epub

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    if not os.path.exists(epub_path):
        build_image_epub(
            task_id,
            task_id,
            pdf_path,
            epub_path,
            dpi=dpi,
            jpeg_quality=quality,
            grayscale=grayscale,
        )
        actual_size = os.path.getsize(epub_path)
        from .services.epub_service import estimate_image_epub_size

        est_original = estimate_image_epub_size(
            pdf_path, total_pages, dpi=100, jpeg_quality=90, grayscale=False
        )
        return jsonify(
            {
                "compressed_size": actual_size,
                "original_size": est_original,
                "reduction_pct": round((1 - actual_size / est_original) * 100)
                if est_original > 0
                else 0,
            }
        )

    compressed_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_compressed.epub")
    )
    build_image_epub(
        task_id,
        task_id,
        pdf_path,
        compressed_path,
        dpi=dpi,
        jpeg_quality=quality,
        grayscale=grayscale,
    )
    actual_size = os.path.getsize(compressed_path)
    original_size = os.path.getsize(epub_path)
    return jsonify(
        {
            "original_size": original_size,
            "compressed_size": actual_size,
            "reduction_pct": round((1 - actual_size / original_size) * 100)
            if original_size > 0
            else 0,
        }
    )


@api_bp.route("/upload_and_extract", methods=["POST"])
def upload_and_extract():
    ensure_storage_dirs()
    if "file" not in request.files:
        return jsonify({"error": "Aucun fichier"}), 400

    file = request.files["file"]
    if not file or not file.filename:
        return jsonify({"error": "Nom de fichier manquant"}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify(
            {"error": "Format non supporte. Seuls les PDF sont acceptes."}
        ), 400

    try:
        file.stream.seek(0, os.SEEK_END)
        file_size = file.stream.tell()
        file.stream.seek(0)
    except Exception:
        file_size = None

    if file_size and file_size > Config.MAX_CONTENT_LENGTH:
        return jsonify(
            {"error": f"Fichier trop volumineux (max {Config.MAX_UPLOAD_SIZE_MB} Mo)."}
        ), 413

    header = file.stream.read(5)
    file.stream.seek(0)
    if header != b"%PDF-":
        return jsonify({"error": "Le fichier ne semble pas etre un PDF valide."}), 400

    original_filename = file.filename
    task_id = str(uuid.uuid4())
    filepath = os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf")
    file.save(filepath)

    try:
        doc = fitz.open(filepath)
    except Exception:
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({"error": "Impossible d'ouvrir le PDF. Fichier corrompu."}), 400

    total_pages = len(doc)
    if total_pages > Config.MAX_UPLOAD_PAGES:
        doc.close()
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify(
            {"error": f"PDF trop long (max {Config.MAX_UPLOAD_PAGES} pages)."}
        ), 400

    sample_text = ""
    pages_to_extract = min(total_pages, Config.EXTRACT_PAGES)
    for i in range(pages_to_extract):
        sample_text += doc[i].get_text()
    doc.close()

    terms = extract_light_novel_terms(sample_text)

    new_trans = Translation(
        task_id=task_id,
        filename=original_filename,
        status="pending",
        total_pages=total_pages,
    )
    db.session.add(new_trans)
    db.session.commit()

    return jsonify({"task_id": task_id, "terms": terms, "total_pages": total_pages})


@api_bp.route("/page/<task_id>/<int:page_num>", methods=["GET"])
def get_page_image(task_id, page_num):
    translated = request.args.get("translated", "false").lower() == "true"

    if translated:
        temp_png_path = os.path.join(
            Config.OUTPUT_FOLDER, f"{task_id}_page_{page_num}.png"
        )
        if os.path.exists(temp_png_path):
            try:
                with open(temp_png_path, "rb") as handle:
                    img_data = handle.read()
                return Response(img_data, mimetype="image/png")
            except Exception as exc:
                return jsonify(
                    {"error": f"Erreur de lecture du PNG temporaire: {str(exc)}"}
                ), 500

        filepath = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")
        if not os.path.exists(filepath):
            return jsonify(
                {"error": "Page non encore traduite (traduction en cours)"}
            ), 404

        try:
            doc = fitz.open(filepath)
            if page_num < 1 or page_num > len(doc):
                doc.close()
                return (
                    jsonify(
                        {
                            "error": f"Numéro de page invalide. Le document contient {len(doc)} pages."
                        }
                    ),
                    400,
                )

            page = doc[page_num - 1]
            pix = page.get_pixmap(dpi=120)
            img_data = pix.tobytes("png")
            doc.close()
            return Response(img_data, mimetype="image/png")
        except Exception as exc:
            return jsonify({"error": str(exc)}), 500

    filepath = os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf")
    if not os.path.exists(filepath):
        return jsonify({"error": f"Fichier original non trouvé: {filepath}"}), 404

    try:
        doc = fitz.open(filepath)
        if page_num < 1 or page_num > len(doc):
            doc.close()
            return (
                jsonify(
                    {
                        "error": f"Numéro de page invalide. Le document contient {len(doc)} pages."
                    }
                ),
                400,
            )

        page = doc[page_num - 1]
        pix = page.get_pixmap(dpi=120)
        img_data = pix.tobytes("png")
        doc.close()
        return Response(img_data, mimetype="image/png")
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@api_bp.route("/start_translation", methods=["POST"])
def start_translation():
    data = request.json or {}
    task_id = data.get("task_id")
    glossary = data.get("glossary", [])
    limit_pages = data.get("limit_pages")
    protagonist_gender = data.get("protagonist_gender", "none")
    translation_mode = data.get("translation_mode", "fast")

    if not task_id:
        return jsonify({"error": "task_id manquant"}), 400

    ensure_storage_dirs()

    filepath = os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf")
    output_path = os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")

    if not os.path.exists(filepath):
        return jsonify({"error": "Fichier source introuvable"}), 404

    try:
        from .celery_tasks import translate_and_build_pdf_task

        trans = Translation.query.filter_by(task_id=task_id).first()
        if trans:
            trans.status = "processing"
            db.session.commit()

        translate_and_build_pdf_task.apply_async(
            args=(
                task_id,
                filepath,
                output_path,
                glossary,
                limit_pages,
                protagonist_gender,
                translation_mode,
            ),
            task_id=task_id,
        )
        print(
            "[Flask] Traduction lancée via CELERY (Genre: "
            f"{protagonist_gender}, Mode: {translation_mode}) pour la tâche {task_id}"
        )
        return jsonify({"status": "started", "mode": "celery"})
    except Exception:
        print(
            "[Flask] Mode Thread classique (Genre: "
            f"{protagonist_gender}, Mode: {translation_mode})..."
        )

        tasks[task_id] = {
            "status": "starting",
            "current_page": 0,
            "total_pages": 0,
            "updated_at": time.time(),
            "cancel_requested": False,
        }

        from threading import Thread

        thread = Thread(
            target=translate_and_build_pdf_fallback,
            args=(
                task_id,
                filepath,
                output_path,
                glossary,
                limit_pages,
                protagonist_gender,
                translation_mode,
            ),
        )
        thread.start()

        return jsonify({"status": "started", "mode": "thread"})


@api_bp.route("/progress/<task_id>", methods=["GET"])
def get_progress(task_id):
    def generate():
        last_activity = time.time()
        last_progress_page = None
        while True:
            celery_state_detected = False
            try:
                from celery.result import AsyncResult
                from .celery_tasks import celery_app

                res = AsyncResult(task_id, app=celery_app)

                if res.state == "PROGRESS":
                    meta = res.info or {}
                    data = {
                        "status": "processing",
                        "current_page": meta.get("current_page", 0),
                        "total_pages": meta.get("total_pages", 0),
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    celery_state_detected = True
                    current_page = meta.get("current_page", 0)
                    if current_page != last_progress_page:
                        last_progress_page = current_page
                        last_activity = time.time()
                    if meta.get("status") == "error":
                        break
                elif res.state == "SUCCESS":
                    meta = res.result or res.info or {}
                    data = {
                        "status": "completed",
                        "current_page": meta.get("total_pages", 0),
                        "total_pages": meta.get("total_pages", 0),
                        "download_url": f"/download/{task_id}",
                        "epub_url": f"/download_epub/{task_id}",
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    celery_state_detected = True
                    last_activity = time.time()
                    break
                elif res.state == "FAILURE":
                    meta = res.info or {}
                    data = {
                        "status": "error",
                        "message": str(meta.get("message", "Erreur de tâche Celery")),
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    celery_state_detected = True
                    last_activity = time.time()
                    break
                elif res.state == "REVOKED":
                    data = {
                        "status": "cancelled",
                        "message": "Tache annulee",
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                    celery_state_detected = True
                    last_activity = time.time()
                    break
                elif res.state == "PENDING":
                    if task_id in tasks:
                        celery_state_detected = False
                    else:
                        data = {
                            "status": "starting",
                            "current_page": 0,
                            "total_pages": 0,
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                        celery_state_detected = True
                        last_activity = time.time()

            except Exception:
                pass

            if not celery_state_detected and task_id in tasks:
                data = tasks[task_id]
                yield f"data: {json.dumps(data)}\n\n"
                last_activity = data.get("updated_at", last_activity)
                if data["status"] in ["completed", "error", "cancelled"]:
                    break

            if time.time() - last_activity > Config.SSE_IDLE_TIMEOUT_SECONDS:
                data = {
                    "status": "error",
                    "message": "Delai d'attente SSE depasse. La tache semble bloquee.",
                }
                yield f"data: {json.dumps(data)}\n\n"
                break

            time.sleep(0.5)

    return Response(generate(), mimetype="text/event-stream")


@api_bp.route("/cancel/<task_id>", methods=["POST"])
def cancel_translation(task_id):
    cancelled = False
    if task_id in tasks:
        tasks[task_id]["cancel_requested"] = True
        tasks[task_id]["status"] = "cancelling"
        tasks[task_id]["updated_at"] = time.time()
        cancelled = True

    try:
        from celery.result import AsyncResult
        from .celery_tasks import celery_app

        res = AsyncResult(task_id, app=celery_app)
        if res.state in ["PENDING", "STARTED", "PROGRESS"]:
            res.revoke(terminate=True)
            celery_app.backend.store_result(task_id, None, "REVOKED")
            cancelled = True
    except Exception:
        pass

    if not cancelled:
        return jsonify({"error": "Tache introuvable ou deja terminee"}), 404

    trans = Translation.query.filter_by(task_id=task_id).first()
    if trans:
        trans.status = "cancelled"
        db.session.commit()

    return jsonify({"status": "cancelled"})


@api_bp.route("/download/<task_id>", methods=["GET"])
def download_file(task_id):
    ensure_storage_dirs()
    output_path = os.path.abspath(
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf")
    )
    return send_file(output_path, as_attachment=True)


@api_bp.route("/download_original/<task_id>", methods=["GET"])
def download_original(task_id):
    ensure_storage_dirs()
    filepath = os.path.abspath(os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf"))
    if not os.path.exists(filepath):
        return jsonify({"error": "Fichier original non trouvé"}), 404
    return send_file(filepath, as_attachment=True)


@api_bp.route("/translations", methods=["GET"])
def list_translations():
    all_trans = Translation.query.order_by(Translation.created_at.desc()).all()
    return jsonify([t.to_dict() for t in all_trans])


@api_bp.route("/translations/<task_id>", methods=["DELETE"])
def delete_translation(task_id):
    trans = Translation.query.filter_by(task_id=task_id).first()
    if not trans:
        return jsonify({"error": "Traduction non trouvée"}), 404

    files_to_delete = [
        os.path.join(Config.UPLOAD_FOLDER, f"{task_id}.pdf"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.pdf"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated.epub"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_original.epub"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_images.epub"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_compressed.epub"),
        os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_translated_images_ref.epub"),
    ]
    for i in range(1, trans.total_pages + 1):
        files_to_delete.append(
            os.path.join(Config.OUTPUT_FOLDER, f"{task_id}_page_{i}.png")
        )

    for filepath in files_to_delete:
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
            except Exception as exc:
                print(f"Erreur lors de la suppression du fichier {filepath}: {exc}")

    db.session.delete(trans)
    db.session.commit()
    return jsonify({"success": True})
