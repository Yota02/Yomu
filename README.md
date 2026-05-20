# 📖 Yomu (読む) - Light Novel Translator & Reader

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)

**Yomu** (du japonais *lire*) est un outil intelligent et premium conçu pour la traduction par lot de **Light Novels (PDF)** de l'anglais vers le français. 

Il combine un backend Flask propulsé par l'IA (Helsinki-NLP ou CTranslate2) et une interface React moderne pour offrir une expérience de lecture bilingue fluide, tout en préservant la mise en page originale.

---

## ✨ Fonctionnalités Clés

*   **⚡ Traduction IA Hybride :**
    *   **Mode Qualité :** Utilise `Helsinki-NLP/opus-mt-en-fr` via PyTorch (Support GPU/CUDA).
    *   **Mode Performance :** Inférence ultra-rapide sur CPU avec **CTranslate2** (Quantification `int8`).
*   **🔍 Extraction de Vocabulaire Intelligente :** Analyse heuristique automatique des personnages, lieux et termes spécifiques (détection des crochets `[...]`, guillemets `《...》`, etc.).
*   **📖 Salon de Lecture "Mirror" :** Lisez vos ouvrages avec une vue côte-à-côte (Original vs Traduit) en haute résolution.
*   **🏗️ Préservation de la Mise en Page :** Remplacement visuel précis du texte original par la traduction directement dans le PDF (Overlay) avec ajustement dynamique de la taille de la police.
*   **📚 Export EPUB :** Génération automatique de fichiers EPUB fluides à partir de vos PDFs traduits.
*   **⚙️ Glossaire Unifié :** Gérez et imposez vos propres traductions pour les termes récurrents à travers toute votre bibliothèque.
*   **⏱️ Traitement Asynchrone :** File d'attente robuste gérée par **Celery** pour traiter de gros volumes sans bloquer l'interface.

---

## 🛠️ Installation

### Backend (Flask)

1. **Cloner le dépôt :**
   ```bash
   git clone https://github.com/votre-username/yomu.git
   cd yomu
   ```

2. **Environnement virtuel :**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

3. **Dépendances :**
   ```bash
   pip install -r requirements.txt
   ```
   *(Si `requirements.txt` n'est pas présent, installez les dépendances listées dans le README d'origine).*

4. **Lancer le serveur :**
   ```bash
   python run_backend.py
   ```

### Lancement Rapide (Backend + Frontend)

Pour lancer les deux services simultanément avec une seule commande :
```bash
python run_yomu.py
```

### Frontend (React)

1. **Installation :**
   ```bash
   cd ln-frontend
   npm install
   ```

2. **Lancement :**
   ```bash
   npm start
   ```

---

## 🚀 Utilisation Optimale

1. **Upload :** Importez vos volumes PDF.
2. **Glossaire :** Validez ou modifiez les termes extraits automatiquement pour garantir la cohérence (ex: noms de personnages).
3. **Traduction :** Lancez le processus. Suivez la progression en temps réel via l'interface.
4. **Lecture :** Utilisez le salon interactif pour comparer les versions ou téléchargez le PDF/EPUB finalisé.

---

## 🧠 Modèles IA

*   **Opus MT (Helsinki-NLP) :** Téléchargé automatiquement lors de la première exécution.
*   **CTranslate2 :** Pour utiliser le mode performance, vous devez placer le modèle converti dans le dossier `model_ct2_en_fr/`. 
    *   *Note : Utilisez l'outil `ct2-transformer-converter` pour convertir un modèle Hugging Face vers le format CTranslate2.*

---

## 🏗️ Architecture

Yomu repose sur une architecture découplée pour garantir performance et extensibilité :

*   **Moteur de rendu :** PyMuPDF (fitz) pour la manipulation avancée des PDFs.
*   **Worker :** Celery + Redis pour la gestion des tâches de fond.
*   **Interface :** React 19 avec un design moderne (Glassmorphism, Lucide icons).

---

## 📝 Licence

Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.

---

*Fait avec ❤️ pour les amateurs de Light Novels.*
