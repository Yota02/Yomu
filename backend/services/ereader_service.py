import os
import platform
import shutil

EREADER_SIGNATURES = {
    "kobo": [".kobo", "Kobo", "KoboReader.sqlite"],
    "kindle": ["documents", "system", ".active_content_sandbox"],
    "pocketbook": ["books", "extensions", "system"],
    "bookeen": ["books", "notes"],
}


def _check_drive(drive_path):
    try:
        entries = set(os.listdir(drive_path))
    except (PermissionError, OSError):
        return None
    for ereader_type, sigs in EREADER_SIGNATURES.items():
        for sig in sigs:
            if sig in entries:
                return {
                    "name": ereader_type.capitalize(),
                    "path": drive_path,
                    "type": ereader_type,
                }
    return None


def _detect_windows():
    import ctypes
    import string

    ereaders = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for letter in string.ascii_uppercase:
        if bitmask & 1:
            drive = f"{letter}:\\"
            result = _check_drive(drive)
            if result:
                ereaders.append(result)
        bitmask >>= 1
    return ereaders


def _detect_unix():
    ereaders = []
    for mount in ["/media", "/mnt", "/Volumes"]:
        if not os.path.isdir(mount):
            continue
        for entry in os.listdir(mount):
            path = os.path.join(mount, entry)
            if os.path.isdir(path):
                result = _check_drive(path)
                if result:
                    ereaders.append(result)
    return ereaders


def detect_ereaders():
    system = platform.system()
    if system == "Windows":
        return _detect_windows()
    return _detect_unix()


def send_to_ereader(ereader_path, epub_path):
    if not os.path.exists(epub_path):
        return False, "Fichier EPUB introuvable"
    if not os.path.isdir(ereader_path):
        return False, "Chemin de la liseuse introuvable"

    dest = ereader_path
    if os.path.isdir(os.path.join(ereader_path, "documents")):
        dest = os.path.join(ereader_path, "documents")

    try:
        shutil.copy2(epub_path, dest)
        return True, f"Fichier envoyé vers {ereader_path}"
    except Exception as e:
        return False, str(e)
