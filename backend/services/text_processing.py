import re
from collections import Counter


def extract_light_novel_terms(text, min_frequency=2):
    terms = []

    capitalized_mid_sentence = re.findall(r"(?<=[a-z]\s)([A-Z][a-zA-Z]+)", text)
    terms.extend(capitalized_mid_sentence)

    bracketed_terms = re.findall(r"\[(.*?)\]|《(.*?)》|\<(.*?)\>", text)
    for match in bracketed_terms:
        for group in match:
            if group:
                terms.append(group.strip())

    term_counts = Counter(terms)
    important_terms = {
        term: count
        for term, count in term_counts.items()
        if count >= min_frequency and len(term) > 2
    }

    sorted_terms = sorted(important_terms.items(), key=lambda x: x[1], reverse=True)
    return [
        {"original": term, "count": count, "translation": ""}
        for term, count in sorted_terms[:50]
    ]


def apply_post_processing(original_text, translated_text):
    original_clean = original_text.strip()
    translated_clean = translated_text.strip()

    if not original_clean:
        return translated_text

    quote_chars = ('"', "“", "”", "«", "»", "「", "」")
    starts_with_quote = original_clean.startswith(quote_chars)
    ends_with_quote = original_clean.endswith(quote_chars)

    if starts_with_quote:
        while translated_clean.startswith(quote_chars) or translated_clean.startswith("'"):
            translated_clean = translated_clean[1:].strip()
    if ends_with_quote:
        while translated_clean.endswith(quote_chars) or translated_clean.endswith("'"):
            translated_clean = translated_clean[:-1].strip()

    if starts_with_quote and ends_with_quote:
        translated_clean = f"«\u00A0{translated_clean}\u00A0»"
    elif starts_with_quote:
        translated_clean = f"«\u00A0{translated_clean}"
    elif ends_with_quote:
        translated_clean = f"{translated_clean}\u00A0»"

    italic_chars = ("*", "_")
    if (
        original_clean.startswith(italic_chars)
        and original_clean.endswith(italic_chars)
        and len(original_clean) > 1
    ):
        char = original_clean[0]
        if not (translated_clean.startswith(char) and translated_clean.endswith(char)):
            translated_clean = f"{char}{translated_clean.strip('*_')}{char}"

    translated_clean = re.sub(r"\s*([!?:;])", "\u00A0\\1", translated_clean)

    end_puncts = (".", "!", "?", "…")
    if original_clean.endswith(end_puncts) and not translated_clean.endswith(end_puncts + quote_chars):
        if translated_clean.endswith("»"):
            translated_clean = translated_clean[:-2].strip() + original_clean[-1] + "\u00A0»"
        else:
            translated_clean += original_clean[-1]
            translated_clean = re.sub(r"\s*([!?:;])$", "\u00A0\\1", translated_clean)

    return translated_clean


def ends_with_period(text):
    text_clean = text.strip()
    if not text_clean:
        return True
    return text_clean[-1] in [".", "!", "?", '"', "”", "»", "…"]
