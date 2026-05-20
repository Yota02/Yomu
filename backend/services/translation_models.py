import os
import warnings

import torch

from ..state import model_lock


warnings.filterwarnings("ignore", message=".*unauthenticated requests to the HF Hub.*")

_tokenizer = None
_model = None
_device = None
_ct2_translator = None


def get_translation_model():
    global _tokenizer, _model, _device
    with model_lock:
        if _model is None:
            print("[Flask] Chargement paresseux du modèle de traduction Helsinki-NLP...")
            from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

            _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model_name = "Helsinki-NLP/opus-mt-en-fr"
            if _tokenizer is None:
                _tokenizer = AutoTokenizer.from_pretrained(model_name)
            _model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
            _model = _model.to(_device)
            print(f"[Flask] Modèle chargé sur {_device} !")
    return _tokenizer, _model, _device


def get_ct2_model():
    global _tokenizer, _ct2_translator
    with model_lock:
        if _ct2_translator is None:
            print("[Flask] Chargement paresseux du modèle CTranslate2...")
            import ctranslate2
            from transformers import AutoTokenizer

            model_name = "Helsinki-NLP/opus-mt-en-fr"
            if _tokenizer is None:
                _tokenizer = AutoTokenizer.from_pretrained(model_name)
            ct2_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "model_ct2_en_fr")
            ct2_path = os.path.abspath(ct2_path)
            _ct2_translator = ctranslate2.Translator(ct2_path, device="cpu", compute_type="int8")
            print("[Flask] Modèle CTranslate2 chargé !")
    return _tokenizer, _ct2_translator
