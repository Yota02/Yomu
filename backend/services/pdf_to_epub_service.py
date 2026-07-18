import os

import fitz

from .epub_service import create_epub_from_text


def convert_pdf_to_epub(task_id, pdf_path, epub_path):
    doc = fitz.open(pdf_path)
    paragraphs = []
    for page in doc:
        text = page.get_text()
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped:
                paragraphs.append(stripped)
    doc.close()

    title = os.path.basename(pdf_path).replace(".pdf", "")
    create_epub_from_text(task_id, title, paragraphs, epub_path)
    return epub_path
