from ebooklib import epub


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
    epub.write_epub(output_path, book, {})
