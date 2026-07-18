import subprocess
import sys
import os
import signal
import time

def run_yomu():
    # Chemins des répertoires
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "ln-frontend")
    
    # Détection de l'environnement virtuel
    venv_python = os.path.join(root_dir, ".venv", "bin", "python")
    if not os.path.exists(venv_python):
        venv_python = os.path.join(root_dir, ".venv", "Scripts", "python.exe")
    
    # Utiliser le python du système si le venv n'existe pas
    python_exe = venv_python if os.path.exists(venv_python) else sys.executable

    print("🚀 Démarrage de Yomu...")

    processes = []

    try:
        # 1. Démarrer le Backend
        print("📂 Lancement du Backend Flask...")
        backend_proc = subprocess.Popen(
            [python_exe, "-u", "run_backend.py"],
            cwd=root_dir
        )
        processes.append(backend_proc)

        # 2. Démarrer le Celery Worker
        print("📂 Lancement du Celery Worker...")
        celery_proc = subprocess.Popen(
            [python_exe, "-u", "-m", "celery", "-A", "backend.celery_tasks.celery_app", "worker", "--loglevel=info", "--pool=solo"],
            cwd=root_dir
        )
        processes.append(celery_proc)

        # 3. Démarrer le Frontend
        print("📂 Lancement du Frontend React (cela peut prendre quelques secondes)...")
        # On utilise shell=True pour npm car c'est souvent un alias/script sous Windows
        frontend_proc = subprocess.Popen(
            ["npm", "start"],
            cwd=frontend_dir,
            shell=(os.name == 'nt')
        )
        processes.append(frontend_proc)

        print("\n✅ Yomu est en cours d'exécution !")
        print("👉 Backend : http://localhost:5001")
        print("👉 Frontend : http://localhost:3000")
        print("pressionnez Ctrl+C pour tout arrêter.\n")

        # Attendre que les processus se terminent
        while True:
            time.sleep(1)
            for p in processes:
                if p.poll() is not None:
                    raise Exception("Un des processus s'est arrêté de manière inattendue.")

    except KeyboardInterrupt:
        print("\n🛑 Arrêt de Yomu...")
    except Exception as e:
        print(f"\n❌ Erreur : {e}")
    finally:
        # Nettoyage des processus
        for p in processes:
            if p.poll() is None:
                if os.name == 'nt':
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(p.pid)])
                else:
                    p.terminate()
        print("👋 Au revoir !")

if __name__ == "__main__":
    run_yomu()
