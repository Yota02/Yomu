from threading import Lock


tasks = {}
model_lock = Lock()
translation_lock = Lock()
translation_model_lock = Lock()
