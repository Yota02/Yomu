import io
import os

import fitz
from ebooklib import epub
from PIL import Image


def _pixmap_to_jpeg(pix, quality=85, grayscale=False):
    mode = "L" if grayscale else "RGB"
    img = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def create_epub_from_text(task_id, title, translated_paragraphs, output_path):
    book = epub.EpubBook()
    book.set_identifier(task_id)
    book.set_title(title)
    book.set_language("fr")

    content = "<html><body>"
    content += f"<h1>{title}</h1>"
    for para in translated_paragraphs:
        para_html = (
            para.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\n", "<br/>")
        )
        content += f"<p>{para_html}</p>"
    content += "</body></html>"

    chapter = epub.EpubHtml(title="Chapitre 1", file_name="chap_1.xhtml", lang="fr")
    chapter.content = content
    book.add_item(chapter)

    book.toc = (epub.Link("chap_1.xhtml", "Contenu", "intro"),)
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    style = "P { margin-bottom: 1em; }"
    nav_css = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=style,
    )
    book.add_item(nav_css)

    book.spine = ["nav", chapter]
    epub.write_epub(output_path, book, {"epub_compression": True})


def build_image_epub(
    task_id, title, pdf_path, output_path, dpi=100, jpeg_quality=90, grayscale=False
):
    book = epub.EpubBook()
    book.set_identifier(task_id)
    book.set_title(title)
    book.set_language("fr")

    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    css_content = (
        "body{margin:0;padding:0;text-align:center}img{max-width:100%;height:auto}"
    )
    nav_css = epub.EpubItem(
        uid="style_nav",
        file_name="style/nav.css",
        media_type="text/css",
        content=css_content,
    )
    book.add_item(nav_css)

    chapters = []
    for i in range(total_pages):
        page = doc[i]
        colorspace = fitz.csGRAY if grayscale else fitz.csRGB
        pix = page.get_pixmap(dpi=dpi, colorspace=colorspace)
        img_bytes = _pixmap_to_jpeg(pix, quality=jpeg_quality, grayscale=grayscale)

        img_filename = f"Images/page_{i + 1:04d}.jpg"
        img_item = epub.EpubImage()
        img_item.file_name = img_filename
        img_item.media_type = "image/jpeg"
        img_item.content = img_bytes
        book.add_item(img_item)

        page_xhtml = epub.EpubHtml(
            title=f"Page {i + 1}",
            file_name=f"Pages/page_{i + 1:04d}.xhtml",
            lang="fr",
        )
        page_xhtml.content = (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f"<!DOCTYPE html>\n"
            f'<html xmlns="http://www.w3.org/1999/xhtml">\n'
            f"<head><title>Page {i + 1}</title></head>\n"
            f'<body><img src="../{img_filename}" alt="Page {i + 1}"/></body>\n'
            f"</html>"
        )
        book.add_item(page_xhtml)
        chapters.append(page_xhtml)

    doc.close()

    book.toc = [
        epub.Link(f"Pages/page_{i + 1:04d}.xhtml", f"Page {i + 1}", f"page_{i + 1}")
        for i in range(total_pages)
    ]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    book.spine = ["nav"] + chapters
    epub.write_epub(output_path, book, {"epub_compression": True})


def preview_page_from_pdf(pdf_path, page_num, dpi=72, jpeg_quality=85, grayscale=False):
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        doc.close()
        raise ValueError(f"Page {page_num} hors limites (1-{len(doc)})")
    page = doc[page_num - 1]
    colorspace = fitz.csGRAY if grayscale else fitz.csRGB
    pix = page.get_pixmap(dpi=dpi, colorspace=colorspace)
    img_bytes = _pixmap_to_jpeg(pix, quality=jpeg_quality, grayscale=grayscale)
    doc.close()
    return img_bytes


def estimate_image_epub_size(
    pdf_path, total_pages, dpi=72, jpeg_quality=85, grayscale=False, samples=3
):
    doc = fitz.open(pdf_path)
    if total_pages <= 10:
        sample_pages = list(range(1, min(total_pages + 1, samples + 1)))
    else:
        start = 11
        if total_pages - start <= samples:
            sample_pages = list(range(start, total_pages + 1))
        else:
            step = (total_pages - start) // (samples + 1)
            sample_pages = [start + step * (i + 1) for i in range(samples)]

    total_bytes = 0
    for p in sample_pages:
        page = doc[p - 1]
        colorspace = fitz.csGRAY if grayscale else fitz.csRGB
        pix = page.get_pixmap(dpi=dpi, colorspace=colorspace)
        total_bytes += len(
            _pixmap_to_jpeg(pix, quality=jpeg_quality, grayscale=grayscale)
        )
    doc.close()

    avg_bytes = total_bytes / len(sample_pages)
    overhead = total_pages * 1024
    estimated = int(avg_bytes * total_pages + overhead)
    return estimated
