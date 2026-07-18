import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Upload, 
  BookOpen, 
  Settings, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  Sparkles, 
  FileText,
  RefreshCw,
  Trash,
  Check,
  AlertCircle,
  Play,
  History,
  ArrowLeft,
  Tablet
} from 'lucide-react';
import './App.css';

const API_BASE = 'http://localhost:5001';

function App() {
  // File queue: array of objects { id, file, name, size, status, taskId, terms, totalPages, progress, downloadUrl, errorMsg }
  const [queue, setQueue] = useState(() => {
    const saved = localStorage.getItem('ln_queue');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.filter(item => item.status !== 'idle' && item.status !== 'uploading');
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [activeFileIndex, setActiveFileIndex] = useState(() => {
    const saved = localStorage.getItem('ln_active_file_index');
    return saved ? Number(saved) : 0;
  });
  const [taskId, setTaskId] = useState(() => {
    return localStorage.getItem('ln_task_id') || null;
  });
  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem('ln_step');
    return saved ? Number(saved) : 1;
  });
  
  const [glossary, setGlossary] = useState([]);
  const [protagonistGender, setProtagonistGender] = useState('none'); // 'none', 'male', 'female'
  const [translationMode, setTranslationMode] = useState('fast'); // 'fast', 'quality'
  const [loading, setLoading] = useState(false);

  // States for the page-by-page display
  const [totalPages, setTotalPages] = useState(() => {
    const saved = localStorage.getItem('ln_total_pages');
    return saved ? Number(saved) : 1;
  });
  const [previewPage, setPreviewPage] = useState(() => {
    const saved = localStorage.getItem('ln_preview_page');
    return saved ? Number(saved) : 1;
  });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [readerLayout, setReaderLayout] = useState('side-by-side'); // 'side-by-side', 'original', 'translated'

  const [history, setHistory] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [backendConnected, setBackendConnected] = useState(null);
  const [ereaders, setEreaders] = useState([]);
  const [selectedEreader, setSelectedEreader] = useState(null);
  const [showEreaderMenu, setShowEreaderMenu] = useState(false);
  const [ereaderSending, setEreaderSending] = useState(null);
  const [ereaderModal, setEreaderModal] = useState(null);
  const [compressQuality, setCompressQuality] = useState(85);
  const [compressDpi, setCompressDpi] = useState(72);
  const [compressGrayscale, setCompressGrayscale] = useState(false);
  const [compressedEpubResult, setCompressedEpubResult] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [previewSamplePage, setPreviewSamplePage] = useState(null);
  const [estimatedSize, setEstimatedSize] = useState(null);

  const checkBackendConnection = async () => {
    try {
      await axios.get(`${API_BASE}/health`);
      setBackendConnected(true);
    } catch (err) {
      setBackendConnected(false);
    }
  };

  const detectEreaders = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ereaders`);
      setEreaders(res.data);
      if (res.data.length > 0 && !selectedEreader) {
        setSelectedEreader(res.data[0]);
      }
    } catch (err) {
      console.error("Erreur de détection des liseuses:", err);
    }
  };

  const openEreaderModal = (taskId, fileName, totalPages) => {
    const pp = totalPages <= 10 ? totalPages : Math.min(totalPages, Math.max(11, Math.floor(totalPages * 0.4)));
    setPreviewSamplePage(pp);
    setCompressedEpubResult(null);
    setEstimatedSize(null);
    setCompressQuality(85);
    setCompressDpi(72);
    setCompressGrayscale(false);
    setEreaderModal({ taskId, fileName, totalPages });
    fetchEstimate(taskId, 85, 72, false);
  };

  const fetchEstimate = async (taskId, quality, dpi, grayscale) => {
    try {
      const res = await axios.get(`${API_BASE}/epub/estimate/${taskId}`, {
        params: { quality, dpi, grayscale: grayscale ? "1" : "0" },
      });
      setEstimatedSize(res.data.estimated_size);
    } catch (err) {
      console.error("Erreur d'estimation:", err);
    }
  };

  const doCompress = async () => {
    if (!ereaderModal) return;
    setIsCompressing(true);
    try {
      const res = await axios.post(`${API_BASE}/epub/compress/${ereaderModal.taskId}`, {
        quality: compressQuality,
        dpi: compressDpi,
        grayscale: compressGrayscale,
      });
      setCompressedEpubResult(res.data);
    } catch (err) {
      alert("Erreur de compression: " + (err.response?.data?.error || err.message));
    }
    setIsCompressing(false);
  };

  const sendToEreader = async (taskId, compressed = false) => {
    if (!selectedEreader || ereaders.length === 0) {
      await detectEreaders();
      if (ereaders.length === 0 && !selectedEreader) {
        alert("Aucune liseuse détectée. Veuillez connecter une liseuse.");
        return;
      }
    }
    setEreaderSending(taskId);
    try {
      await axios.post(`${API_BASE}/ereaders/send`, {
        ereader_path: selectedEreader.path,
        task_id: taskId,
        compressed: compressed,
      });
      alert("Fichier envoyé à la liseuse avec succès !");
      setEreaderModal(null);
    } catch (err) {
      alert("Erreur lors de l'envoi à la liseuse: " + (err.response?.data?.error || err.message));
    }
    setEreaderSending(null);
  };

  useEffect(() => {
    checkBackendConnection();
    detectEreaders();
    const interval = setInterval(() => {
      checkBackendConnection();
      detectEreaders();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/translations`);
      setHistory(res.data);
    } catch (err) {
      console.error("Erreur lors de la récupération de l'historique:", err);
    }
    setLoading(false);
  };

  const deleteFromHistory = async (id, tid) => {
    if (!window.confirm("Voulez-vous vraiment supprimer cette traduction ?")) return;
    try {
      await axios.delete(`${API_BASE}/translations/${tid}`);
      setHistory(prev => prev.filter(h => h.task_id !== tid));
    } catch (err) {
      alert("Erreur lors de la suppression.");
    }
  };

  const loadFromHistory = (item) => {
    // Simuler une queue avec un seul élément complété
    const queueItem = {
      id: item.task_id,
      name: item.filename,
      status: 'completed',
      taskId: item.task_id,
      totalPages: item.total_pages,
      downloadUrl: `${API_BASE}${item.download_url}`,
      epubUrl: `${API_BASE}${item.epub_url}`,
      progress: { current: item.total_pages, total: item.total_pages, status: 'completed' }
    };
    setQueue([queueItem]);
    setActiveFileIndex(0);
    setTaskId(item.task_id);
    setTotalPages(item.total_pages);
    setPreviewPage(1);
    setStep(4);
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const newItems = selectedFiles.map((f, index) => ({
      id: Date.now() + '-' + index + '-' + Math.random().toString(36).substr(2, 5),
      file: f,
      name: f.name,
      size: f.size,
      status: 'idle',
      taskId: null,
      terms: null,
      totalPages: 1,
      progress: { current: 0, total: 0, status: 'idle' },
      downloadUrl: null,
      epubUrl: null,
      errorMsg: null
    }));
    setQueue(prev => [...prev, ...newItems]);
    e.target.value = null; // Reset file input
  };

  const removeFromQueue = (id) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const analyzeQueue = async () => {
    setLoading(true);
    let updatedQueue = [...queue];
    
    for (let i = 0; i < updatedQueue.length; i++) {
      const item = updatedQueue[i];
      if (item.status !== 'idle' && item.status !== 'error') continue;
      
      updatedQueue[i] = { ...item, status: 'uploading', errorMsg: null };
      setQueue([...updatedQueue]);
      
      const formData = new FormData();
      formData.append('file', item.file);
      
      try {
        const res = await axios.post(`${API_BASE}/upload_and_extract`, formData);
        updatedQueue[i] = {
          ...updatedQueue[i],
          status: 'extracted',
          taskId: res.data.task_id,
          terms: res.data.terms,
          totalPages: res.data.total_pages || 1,
        };
      } catch (err) {
        console.error(err);
        updatedQueue[i] = {
          ...updatedQueue[i],
          status: 'error',
          errorMsg: "Impossible d'analyser ce fichier PDF."
        };
      }
      setQueue([...updatedQueue]);
    }
    
    setLoading(false);
  };

  const proceedToGlossary = () => {
    const extractedItems = queue.filter(item => item.status === 'extracted');
    if (extractedItems.length === 0) {
      alert("Veuillez d'abord analyser au moins un fichier PDF avec succès.");
      return;
    }
    
    // Charger le glossaire sauvegardé localement pour pré-remplir les traductions existantes
    const savedGlossary = JSON.parse(localStorage.getItem('ln_glossary') || '[]');
    const savedMap = {};
    savedGlossary.forEach(item => {
      if (item.original && item.translation) {
        savedMap[item.original.toLowerCase()] = item.translation;
      }
    });

    // Aggregation of terms to construct the Unified Glossary
    const merged = {};
    extractedItems.forEach(item => {
      if (item.terms) {
        item.terms.forEach(t => {
          if (merged[t.original]) {
            merged[t.original].count += t.count;
          } else {
            const savedTranslation = savedMap[t.original.toLowerCase()] || t.translation || "";
            merged[t.original] = { original: t.original, count: t.count, translation: savedTranslation };
          }
        });
      }
    });
    
    const sortedMerged = Object.values(merged).sort((a, b) => b.count - a.count);
    setGlossary(sortedMerged);
    
    // Configure default preview with the first successfully analyzed file
    const firstItem = extractedItems[0];
    const firstIdx = queue.findIndex(item => item.id === firstItem.id);
    setActiveFileIndex(firstIdx);
    setTaskId(firstItem.taskId);
    setTotalPages(firstItem.totalPages);
    setPreviewPage(1);
    
    setStep(2);
  };

  // Enregistrer automatiquement le glossaire dans le localStorage à chaque modification
  useEffect(() => {
    if (glossary && glossary.length > 0) {
      localStorage.setItem('ln_glossary', JSON.stringify(glossary));
    }
  }, [glossary]);

  const updateGlossary = (index, value) => {
    const newGlossary = [...glossary];
    newGlossary[index].translation = value;
    setGlossary(newGlossary);
  };

  const exportGlossaryJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(glossary, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "glossaire_light_novel.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importGlossaryJSON = (e) => {
    const fileReader = new FileReader();
    const file = e.target.files[0];
    if (!file) return;
    
    fileReader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          // Fusionner intelligemment avec le glossaire actif
          const mergedGlossary = [...glossary];
          imported.forEach(impItem => {
            if (!impItem.original) return;
            const idx = mergedGlossary.findIndex(item => item.original.toLowerCase() === impItem.original.toLowerCase());
            if (idx !== -1) {
              if (impItem.translation) {
                mergedGlossary[idx].translation = impItem.translation;
              }
            } else {
              mergedGlossary.push({
                original: impItem.original,
                count: impItem.count || 1,
                translation: impItem.translation || ""
              });
            }
          });
          setGlossary(mergedGlossary);
          localStorage.setItem('ln_glossary', JSON.stringify(mergedGlossary));
          alert("Glossaire importé et fusionné avec succès !");
        } else {
          alert("Le fichier JSON doit contenir un tableau de termes.");
        }
      } catch (err) {
        alert("Erreur lors de la lecture du fichier JSON : " + err.message);
      }
    };
    fileReader.readAsText(file, "UTF-8");
    e.target.value = null; // Reset input
  };

  const trackSingleProgress = (index, id) => {
    return new Promise((resolve) => {
      const eventSource = new EventSource(`${API_BASE}/progress/${id}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        setQueue(prevQueue => {
          const nextQueue = [...prevQueue];
          nextQueue[index] = {
            ...nextQueue[index],
            progress: {
              current: data.current_page,
              total: data.total_pages,
              status: data.status
            }
          };
          
          if (data.status === 'completed') {
            nextQueue[index].status = 'completed';
            nextQueue[index].downloadUrl = data.download_url ? `${API_BASE}${data.download_url}` : `${API_BASE}/download/${id}`;
            nextQueue[index].epubUrl = data.epub_url ? `${API_BASE}${data.epub_url}` : `${API_BASE}/download_epub/${id}`;
          } else if (data.status === 'error') {
            nextQueue[index].status = 'error';
            nextQueue[index].errorMsg = data.message || "Erreur de traduction";
          } else if (data.status === 'cancelled') {
            nextQueue[index].status = 'cancelled';
            nextQueue[index].errorMsg = data.message || "Traduction annulee";
          }
          
          return nextQueue;
        });

        if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
          eventSource.close();
          resolve();
        }
      };

      eventSource.onerror = () => {
        console.error("EventSource failed for taskId: " + id);
        setQueue(prevQueue => {
          const nextQueue = [...prevQueue];
          nextQueue[index].status = 'error';
          nextQueue[index].errorMsg = "Connexion perdue avec le serveur de progression";
          return nextQueue;
        });
        eventSource.close();
        resolve();
      };
    });
  };

  const cancelTranslation = async (index, taskId) => {
    try {
      setQueue(prev => {
        const next = [...prev];
        next[index].status = 'cancelling';
        return next;
      });
      await axios.post(`${API_BASE}/cancel/${taskId}`);
    } catch (err) {
      setQueue(prev => {
        const next = [...prev];
        next[index].status = 'error';
        next[index].errorMsg = "Impossible d'annuler la traduction";
        return next;
      });
    }
  };

  const startBatchTranslation = async () => {
    setStep(3);
    
    const extractedItems = queue.filter(item => item.status === 'extracted');
    if (extractedItems.length === 0) return;
    
    let localQueue = queue.map(item => {
      if (item.status === 'extracted') {
        return {
          ...item,
          status: 'translating',
          progress: { current: 0, total: item.totalPages, status: 'starting' }
        };
      }
      return item;
    });
    setQueue(localQueue);
    
    // Start translations concurrently
    const promises = localQueue.map(async (item, i) => {
      if (item.status !== 'translating') return;
      
      try {
        await axios.post(`${API_BASE}/start_translation`, {
          task_id: item.taskId,
          glossary: glossary, // Send unified glossary
          protagonist_gender: protagonistGender,
          translation_mode: translationMode,
          limit_pages: null
        });
        
        await trackSingleProgress(i, item.taskId);
      } catch (err) {
        console.error(err);
        setQueue(prev => {
          const next = [...prev];
          next[i].status = 'error';
          next[i].errorMsg = "Impossible d'initier la traduction";
          return next;
        });
      }
    });

    await Promise.all(promises);

    // After sequential translation ends, automatically load the Reading Room
    setQueue(currentQueue => {
      const completedItems = currentQueue.filter(item => item.status === 'completed');
      if (completedItems.length > 0) {
        const firstCompletedIdx = currentQueue.findIndex(item => item.status === 'completed');
        const firstCompleted = currentQueue[firstCompletedIdx];
        
        setActiveFileIndex(firstCompletedIdx);
        setTaskId(firstCompleted.taskId);
        setTotalPages(firstCompleted.totalPages);
        setPreviewPage(1);
        setStep(4);
      } else {
        alert("Aucun fichier n'a pu être traduit avec succès.");
        setStep(1);
      }
      return currentQueue;
    });
  };

  useEffect(() => {
    localStorage.setItem('ln_queue', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem('ln_active_file_index', activeFileIndex);
  }, [activeFileIndex]);

  useEffect(() => {
    if (taskId) {
      localStorage.setItem('ln_task_id', taskId);
    } else {
      localStorage.removeItem('ln_task_id');
    }
  }, [taskId]);

  useEffect(() => {
    localStorage.setItem('ln_step', step);
  }, [step]);

  useEffect(() => {
    localStorage.setItem('ln_total_pages', totalPages);
  }, [totalPages]);

  useEffect(() => {
    localStorage.setItem('ln_preview_page', previewPage);
  }, [previewPage]);

  useEffect(() => {
    // Resume tracking for any active translations in the queue
    const savedQueue = localStorage.getItem('ln_queue');
    if (savedQueue) {
      try {
        const parsedQueue = JSON.parse(savedQueue);
        parsedQueue.forEach((item, index) => {
          if (item.status === 'translating') {
            console.log("Resuming tracking for task:", item.taskId);
            trackSingleProgress(index, item.taskId);
          }
        });
      } catch (err) {
        console.error("Error resuming translation tracking:", err);
      }
    }
  }, []); // Run once on mount

  useEffect(() => {
    if (step === 3 && queue.length > 0) {
      const isTranslating = queue.some(item => item.status === 'translating');
      if (!isTranslating) {
        const completedItems = queue.filter(item => item.status === 'completed');
        if (completedItems.length > 0) {
          const firstCompletedIdx = queue.findIndex(item => item.status === 'completed');
          const firstCompleted = queue[firstCompletedIdx];
          
          setActiveFileIndex(firstCompletedIdx);
          setTaskId(firstCompleted.taskId);
          setTotalPages(firstCompleted.totalPages);
          setPreviewPage(1);
          setStep(4);
        } else {
          alert("Aucun fichier n'a pu être traduit avec succès.");
          setStep(1);
        }
      }
    }
  }, [queue, step]);

  const activeTranslationItem = queue.find(item => item.status === 'translating');

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div className="brand" onClick={() => setStep(1)} style={{ cursor: 'pointer' }}>
          <BookOpen size={36} color="var(--primary)" />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1>Yomu</h1>
              {backendConnected !== null && (
                <div className={`connection-status ${backendConnected ? 'connected' : 'disconnected'}`} title={backendConnected ? "Connecté au serveur backend" : "Serveur backend hors ligne"}>
                  <span className="status-dot"></span>
                  <span className="status-text">{backendConnected ? "Connecté" : "Hors ligne"}</span>
                </div>
              )}
              <div className="ereader-status-wrapper">
                <div className={`connection-status ${ereaders.length > 0 ? 'connected' : 'disconnected'}`} onClick={() => { detectEreaders(); setShowEreaderMenu(!showEreaderMenu); }} style={{ cursor: 'pointer' }} title={ereaders.length > 0 ? `${ereaders.length} liseuse(s) détectée(s)` : "Aucune liseuse détectée"}>
                  <Tablet size={12} />
                  <span className="status-text">{ereaders.length > 0 ? (selectedEreader ? selectedEreader.name : `${ereaders.length}`) : "Liseuse"}</span>
                </div>
                {showEreaderMenu && ereaders.length > 0 && (
                  <div className="ereader-dropdown">
                    {ereaders.map((er, idx) => (
                      <div key={idx} className={`ereader-option ${selectedEreader?.path === er.path ? 'active' : ''}`} onClick={() => { setSelectedEreader(er); setShowEreaderMenu(false); }}>
                        <Tablet size={14} />
                        <span>{er.name} ({er.path})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="brand-subtitle">Traduction intelligente de Light Novels avec glossaire global unifié</div>
          </div>
        </div>

        {/* Dynamic Progress indicator */}
        <div className="steps-nav">
          {step === 0 ? (
            <span className="step-indicator active">Historique des traductions</span>
          ) : (
            <>
              <span className={`step-indicator ${step === 1 ? 'active' : ''}`} onClick={() => setStep(1)} style={{ cursor: 'pointer' }}>1. Import & File</span>
              <span className={`step-indicator ${step === 2 ? 'active' : ''}`}>2. Glossaire</span>
              <span className={`step-indicator ${step === 3 ? 'active' : ''}`}>3. Traduction</span>
              <span className={`step-indicator ${step === 4 ? 'active' : ''}`}>4. Lecture</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {step !== 0 ? (
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                setStep(0);
                fetchHistory();
              }}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
            >
              <History size={16} /> Historique
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={() => setStep(1)}
              style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
            >
              <ArrowLeft size={16} /> Retour
            </button>
          )}
        </div>
      </header>

      {/* ÉTAPE 0 : HISTORIQUE */}
      {step === 0 && (
        <div className="history-container">
          <div className="card" style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Historique des traductions</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Retrouvez ici vos anciennes traductions. Vous pouvez les télécharger à nouveau ou les ouvrir dans le salon de lecture.
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <RefreshCw className="loader-spinner" style={{ margin: '0 auto 20px', borderLeftColor: 'var(--primary)' }} />
              <p>Chargement de l'historique...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
              <History size={48} color="#cbd5e1" style={{ margin: '0 auto 20px' }} />
              <p style={{ color: 'var(--text-muted)' }}>Aucune traduction trouvée dans l'historique.</p>
              <button onClick={() => setStep(1)} className="btn btn-primary" style={{ margin: '20px auto 0' }}>
                Commencer une nouvelle traduction
              </button>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div 
                  key={item.id} 
                  className={`history-item ${selectedTask === item.task_id ? 'expanded' : ''}`}
                  onClick={() => setSelectedTask(selectedTask === item.task_id ? null : item.task_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="history-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div className="history-info">
                      {item.status === 'completed' ? (
                        <a 
                          href={`${API_BASE}${item.download_url}`}
                          download
                          className="history-filename clickable-filename"
                          title="Télécharger le PDF traduit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.filename}
                        </a>
                      ) : (
                        <span className="history-filename" title={item.filename}>{item.filename}</span>
                      )}
                      <div className="history-meta">
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={12} /> {item.total_pages} pages</span>
                        <span>{new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span style={{ 
                          color: item.status === 'completed' ? 'var(--success)' : item.status === 'error' ? '#ef4444' : 'var(--primary)',
                          fontWeight: '600'
                        }}>
                          {item.status === 'completed' ? 'Terminé' : item.status === 'error' ? 'Erreur' : 'En cours'}
                        </span>
                      </div>
                    </div>
                    <div className="history-actions">
                      {item.status === 'completed' && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); loadFromHistory(item); }}
                            className="btn btn-secondary btn-icon" 
                            title="Lire (Salon de lecture)"
                          >
                            <BookOpen size={18} />
                          </button>
                          <a 
                            href={`${API_BASE}${item.download_url}`} 
                            download 
                            className="btn btn-success btn-icon" 
                            title="Télécharger le PDF traduit"
                            style={{ textDecoration: 'none' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download size={18} />
                          </a>
                          <a 
                            href={`${API_BASE}${item.epub_url}`} 
                            download 
                            className="btn btn-icon" 
                            title="Télécharger l'EPUB traduit"
                            style={{ 
                              textDecoration: 'none', 
                              backgroundColor: '#8b5cf6', 
                              color: '#fff', 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              justifyContent: 'center' 
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <BookOpen size={18} />
                          </a>
                          <button 
                            onClick={(e) => { e.stopPropagation(); openEreaderModal(item.task_id, item.filename, item.total_pages); }} 
                            className="btn btn-secondary btn-icon" 
                            title="Envoyer à la liseuse"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Tablet size={18} />
                          </button>
                        </>
                      )}
                      {item.original_url && (
                        <a 
                          href={`${API_BASE}${item.original_url}`} 
                          download 
                          className="btn btn-secondary btn-icon" 
                          title="Télécharger le PDF Original (EN)"
                          style={{ 
                            textDecoration: 'none', 
                            backgroundColor: '#64748b', 
                            color: '#fff', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center' 
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText size={18} />
                        </a>
                      )}
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id, item.task_id); }}
                        className="btn btn-secondary btn-icon" 
                        title="Supprimer la traduction"
                      >
                        <Trash size={18} color="#ef4444" />
                      </button>
                    </div>
                  </div>

                  {selectedTask === item.task_id && (
                    <div className="history-details" onClick={(e) => e.stopPropagation()}>
                      <div className="details-grid">
                        <div className="details-card">
                          <span className="details-label">ID de la tâche</span>
                          <code className="details-value-code">{item.task_id}</code>
                        </div>
                        <div className="details-card">
                          <span className="details-label">Date d'importation</span>
                          <span className="details-value">
                            {new Date(item.created_at).toLocaleString('fr-FR', { 
                              day: 'numeric', 
                              month: 'long', 
                              year: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit' 
                            })}
                          </span>
                        </div>
                        <div className="details-card">
                          <span className="details-label">Statut global</span>
                          <span className={`details-value status-badge ${item.status}`}>
                            {item.status === 'completed' ? 'Terminé' : item.status === 'error' ? 'Erreur' : 'En cours'}
                          </span>
                        </div>
                        <div className="details-card">
                          <span className="details-label">Progression des pages</span>
                          <span className="details-value">
                            Page <strong>{item.current_page}</strong> sur <strong>{item.total_pages}</strong> ({item.total_pages > 0 ? Math.round((item.current_page / item.total_pages) * 100) : 0}%)
                          </span>
                        </div>
                      </div>

                      {item.status !== 'completed' && item.status !== 'error' && (
                        <div className="details-progress-section">
                          <div className="details-progress-bar-bg">
                            <div 
                              className="details-progress-bar-fill" 
                              style={{ width: `${item.total_pages > 0 ? (item.current_page / item.total_pages) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className={`details-message ${item.status}`}>
                        <div className="details-message-title">
                          {item.status === 'completed' && '✓ Traduction terminée'}
                          {item.status === 'error' && '✗ Échec de la traduction'}
                          {item.status !== 'completed' && item.status !== 'error' && '↻ Traduction en cours'}
                        </div>
                        <p className="details-message-text">
                          {item.status === 'completed' ? (
                            "Le processus de traduction s'est déroulé sans encombre. Vous disposez désormais de la version PDF et de la version EPUB française générée à l'aide de votre glossaire unifié. Vous pouvez également consulter le PDF original."
                          ) : item.status === 'error' ? (
                            "La traduction a échoué. Cela peut être dû à un problème avec le fichier PDF source ou à une interruption du service de traduction. Vous pouvez néanmoins récupérer votre PDF original en anglais."
                          ) : (
                            "Le volume est actuellement en cours de traitement par notre moteur de traduction IA. Le document est traduit page par page afin d'appliquer parfaitement les termes définis dans votre glossaire."
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 1 : IMPORT & LISTE DE FILE */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '850px', margin: '40px auto' }}>
          <div className="card" style={{ padding: '30px', margin: 0 }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>1. Importer les fichiers PDF</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Sélectionnez un ou plusieurs volumes au format PDF. Nous allons analyser chaque fichier pour en extraire un glossaire global sur-mesure (personnages, lieux, compétences) partagé entre tous vos volumes.
            </p>
            
            <div className="upload-zone" onClick={() => document.getElementById('pdf-inputs').click()}>
              <input 
                id="pdf-inputs"
                type="file" 
                multiple
                accept=".pdf" 
                onChange={handleFileChange} 
                style={{ display: 'none' }}
              />
              <div className="upload-icon">
                <Upload size={32} />
              </div>
              <div>
                <strong style={{ color: 'var(--primary)' }}>Cliquez pour choisir un ou plusieurs fichiers</strong>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>PDF uniquement</div>
              </div>
            </div>
          </div>

          {queue.length > 0 && (
            <div className="card" style={{ padding: '24px', margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
                  File d'attente ({queue.length} document{queue.length > 1 ? 's' : ''})
                </h3>
                {queue.some(item => item.status === 'idle' || item.status === 'error') && (
                  <button onClick={analyzeQueue} disabled={loading} className="btn" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}>
                    {loading ? (
                      <>
                        <RefreshCw size={14} className="loader-spinner" style={{ borderLeftColor: '#fff', borderTopColor: '#fff', borderRightColor: '#fff', borderWidth: '2px', width: '12px', height: '12px', margin: 0 }} />
                        Analyse...
                      </>
                    ) : (
                      <>
                        <Play size={14} /> Lancer l'analyse
                      </>
                    )}
                  </button>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th>Nom du fichier</th>
                      <th style={{ width: '100px' }}>Taille</th>
                      <th style={{ width: '220px' }}>Statut</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((item) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: '500' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={16} color="var(--primary)" />
                            <span className="file-name-cell" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                          {formatSize(item.size)}
                        </td>
                        <td>
                          {item.status === 'idle' && (
                            <span className="queue-badge badge-idle">Prêt pour l'analyse</span>
                          )}
                          {item.status === 'uploading' && (
                            <span className="queue-badge badge-uploading">
                              <RefreshCw size={12} className="loader-spinner" style={{ margin: '0 6px 0 0', width: '10px', height: '10px', borderLeftColor: 'var(--primary)' }} />
                              Analyse...
                            </span>
                          )}
                          {item.status === 'extracted' && (
                            <span className="queue-badge badge-extracted">
                              Analysé ({item.totalPages} pages)
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="queue-badge badge-error" title={item.errorMsg}>
                              Échec de l'analyse
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            onClick={() => removeFromQueue(item.id)} 
                            disabled={loading}
                            className="btn btn-secondary" 
                            style={{ padding: '6px', minWidth: 'auto', borderRadius: '4px', display: 'inline-flex' }}
                            title="Supprimer"
                          >
                            <Trash size={14} color="#ef4444" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {queue.some(item => item.status === 'extracted') && (
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={proceedToGlossary} className="btn btn-success">
                    Valider le Glossaire Global <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 2 : GLOSSAIRE UNIQUE ET APERÇU DE PAGE */}
      {step === 2 && (
        <div className="workspace-layout">
          {/* Colonne de Gauche : Glossaire Unique */}
          <div className="card glossary-card">
            <div className="glossary-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 0', fontSize: '20px' }}>
                <Settings size={24} color="var(--primary)" />
                2. Validation du Glossaire Global
              </h2>
              <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '13.5px', lineHeight: '1.4' }}>
                Saisissez les traductions forcées pour les termes récurrents détectés sur l'ensemble de la file d'attente. Ils seront appliqués à tous vos PDF !
              </p>
            </div>

            {/* Boutons d'Import / Export JSON (Idée 4) */}
            <div style={{ display: 'flex', gap: '12px', margin: '16px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <button 
                onClick={exportGlossaryJSON} 
                className="btn btn-secondary" 
                style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  fontSize: '13px',
                  padding: '10px 14px' 
                }}
              >
                <Download size={16} /> Exporter JSON
              </button>
              <button 
                onClick={() => document.getElementById('import-glossary-input').click()} 
                className="btn btn-secondary" 
                style={{ 
                  flex: 1, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '8px',
                  fontSize: '13px',
                  padding: '10px 14px' 
                }}
              >
                <Upload size={16} /> Importer JSON
              </button>
              <input 
                id="import-glossary-input"
                type="file"
                accept=".json"
                onChange={importGlossaryJSON}
                style={{ display: 'none' }}
              />
            </div>
            
            <div className="glossary-table-container">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>Terme Original (EN)</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Total Occurrences</th>
                    <th>Traduction Forcée (FR)</th>
                  </tr>
                </thead>
                <tbody>
                  {glossary.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong className="word-badge">{item.original}</strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="count-badge">{item.count}</span>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={item.translation}
                          placeholder="Ex: Porteur d'ombre..."
                          onChange={(e) => updateGlossary(idx, e.target.value)}
                          className="forced-input"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>


            <div style={{ marginTop: '20px', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 10px 0', color: 'var(--text-color)' }}>Mode de traduction</h3>
              <div style={{ display: 'flex', gap: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="translationMode" 
                    value="fast" 
                    checked={translationMode === 'fast'} 
                    onChange={(e) => setTranslationMode(e.target.value)}
                  />
                  <span>Rapide (CTranslate2 - Recommandé)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input 
                    type="radio" 
                    name="translationMode" 
                    value="quality" 
                    checked={translationMode === 'quality'} 
                    onChange={(e) => setTranslationMode(e.target.value)}
                  />
                  <span>Qualitatif (Transformers Standard)</span>
                </label>
              </div>
            </div>

            <button onClick={startBatchTranslation} className="btn btn-success" style={{ width: '100%' }}>
              Lancer la traduction de la file ({queue.filter(i => i.status === 'extracted').length} PDF) <Sparkles size={18} />
            </button>
          </div>

          {/* Colonne de Droite : Aperçu du PDF Original Page par Page avec Sélecteur */}
          <div className="card page-viewer-card">
            <div className="viewer-header">
              <div className="viewer-title" style={{ gap: '10px', flex: 1, overflow: 'hidden' }}>
                <FileText size={18} color="#94a3b8" />
                <span style={{ fontSize: '13px', color: '#94a3b8', marginRight: '4px', whiteSpace: 'nowrap' }}>Aperçu :</span>
                <select 
                  value={activeFileIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setActiveFileIndex(idx);
                    const item = queue[idx];
                    setTaskId(item.taskId);
                    setTotalPages(item.totalPages);
                    setPreviewPage(1);
                  }}
                  className="reader-page-select"
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#fff',
                    borderColor: '#334155',
                    fontSize: '13px',
                    padding: '4px 8px',
                    maxWidth: '180px',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {queue.map((item, idx) => (
                    item.status === 'extracted' && (
                      <option key={item.id} value={idx}>{item.name}</option>
                    )
                  ))}
                </select>
              </div>
              <div className="viewer-controls">
                <button 
                  className="viewer-btn"
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage(prev => prev - 1)}
                  title="Page précédente"
                >
                  <ChevronLeft size={18} />
                </button>
                <span style={{ fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Page {previewPage} / {totalPages}
                </span>
                <button 
                  className="viewer-btn"
                  disabled={previewPage >= totalPages}
                  onClick={() => setPreviewPage(prev => prev + 1)}
                  title="Page suivante"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="page-display-container">
              <img 
                key={`orig-preview-${previewPage}-${taskId}`}
                src={`${API_BASE}/page/${taskId}/${previewPage}?translated=false`}
                alt={`Page ${previewPage} originale`}
                className="pdf-page-img"
              />
            </div>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : TRADUCTION DE LA FILE D'ATTENTE */}
      {step === 3 && (
        <div className="card" style={{ maxWidth: '800px', margin: '40px auto' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RefreshCw className="loader-spinner" style={{ width: '22px', height: '22px', margin: 0, borderLeftColor: 'var(--primary)' }} />
            3. Traduction de la file d'attente
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Veuillez patienter pendant que notre modèle Helsinki-NLP traduit vos romans l'un après l'autre. Le glossaire global est appliqué à chaque volume.
          </p>

          <div className="queue-translation-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            {queue.map((item, idx) => {
              const pct = item.progress.total > 0 ? Math.round((item.progress.current / item.progress.total) * 100) : 0;
              return (
                <div key={item.id} className={`queue-translation-item ${item.status}`} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: item.status === 'translating' ? 'var(--primary)' : item.status === 'completed' ? 'var(--success)' : '#cbd5e1',
                  backgroundColor: item.status === 'translating' ? 'var(--primary-light)' : item.status === 'completed' ? '#f0fdf4' : '#f8fafc',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: item.status === 'translating' ? '8px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.status === 'completed' && <CheckCircle size={18} color="var(--success)" />}
                  {item.status === 'error' && <AlertCircle size={18} color="#ef4444" />}
                  {item.status === 'cancelled' && <AlertCircle size={18} color="#f59e0b" />}
                  {item.status === 'cancelling' && <RefreshCw size={18} className="loader-spinner" style={{ margin: 0, width: '16px', height: '16px', borderLeftColor: '#f59e0b' }} />}
                  {item.status === 'translating' && <RefreshCw size={18} className="loader-spinner" style={{ margin: 0, width: '16px', height: '16px', borderLeftColor: 'var(--primary)' }} />}
                  {item.status === 'idle' && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#64748b' }} />}
                  <span className="file-name-cell" style={{ fontWeight: '600', color: '#0f172a', fontSize: '14.5px' }} title={item.name}>{item.name}</span>
                </div>

                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                  {item.status === 'completed' && <span style={{ color: 'var(--success)' }}>Terminé</span>}
                  {item.status === 'error' && <span style={{ color: '#ef4444' }}>Échec</span>}
                  {item.status === 'cancelled' && <span style={{ color: '#f59e0b' }}>Annulé</span>}
                  {item.status === 'cancelling' && <span style={{ color: '#f59e0b' }}>Annulation...</span>}
                  {item.status === 'translating' && <span style={{ color: 'var(--primary)' }}>En cours ({pct}%)</span>}
                  {item.status === 'idle' && <span style={{ color: '#64748b' }}>En attente</span>}
                </div>
              </div>

              {item.status === 'translating' && (
                <>
                  <div className="glow-progress-container" style={{ margin: '4px 0 8px 0', height: '10px' }}>
                    <div className="glow-progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>Page {item.progress.current} sur {item.progress.total}</span>
                    <span>Statut : {item.progress.status === 'processing' ? 'Post-glossaire actif' : item.progress.status}</span>
                  </div>
                </>
              )}

              {(item.status === 'translating' || item.status === 'cancelling') && (
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px' }}
                    onClick={() => cancelTranslation(idx, item.taskId)}
                    disabled={item.status === 'cancelling'}
                  >
                    Annuler
                  </button>
                </div>
              )}

              {(item.status === 'error' || item.status === 'cancelled') && item.errorMsg && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>
                  ⚠️ {item.errorMsg}
                </div>
              )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ÉTAPE 4 : SALON DE LECTURE MULTI-DOCUMENTS */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="reader-room">
            {/* Barre d'outils du Lecteur */}
            <div className="reader-toolbar">
              <div className="brand" style={{ gap: '8px' }}>
                <BookOpen size={24} color="var(--primary)" />
                <span style={{ fontWeight: '800', fontSize: '16px', letterSpacing: '-0.5px' }}>
                  Salon de Lecture
                </span>
              </div>

              {/* Navigation Page par Page */}
              <div className="reader-nav">
                <button 
                  className="viewer-btn"
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage(prev => prev - 1)}
                  title="Page précédente"
                >
                  <ChevronLeft size={18} />
                </button>
                
                <select 
                  value={previewPage} 
                  onChange={(e) => setPreviewPage(Number(e.target.value))}
                  className="reader-page-select"
                >
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map(num => (
                    <option key={num} value={num}>Page {num} / {totalPages}</option>
                  ))}
                </select>

                <button 
                  className="viewer-btn"
                  disabled={previewPage >= totalPages}
                  onClick={() => setPreviewPage(prev => prev + 1)}
                  title="Page suivante"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Contrôles de Zoom */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button 
                  className="viewer-btn" 
                  onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.1))} 
                  title="Zoom arrière"
                >
                  <ZoomOut size={16} />
                </button>
                <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '40px', textAlign: 'center' }}>
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button 
                  className="viewer-btn" 
                  onClick={() => setZoomLevel(prev => Math.min(2.0, prev + 0.1))} 
                  title="Zoom avant"
                >
                  <ZoomIn size={16} />
                </button>
              </div>

              {/* Disposition */}
              <div className="reader-layout-toggle">
                <button 
                  className={`toggle-option ${readerLayout === 'side-by-side' ? 'active' : ''}`}
                  onClick={() => setReaderLayout('side-by-side')}
                >
                  Côte-à-côte
                </button>
                <button 
                  className={`toggle-option ${readerLayout === 'original' ? 'active' : ''}`}
                  onClick={() => setReaderLayout('original')}
                >
                  Original
                </button>
                <button 
                  className={`toggle-option ${readerLayout === 'translated' ? 'active' : ''}`}
                  onClick={() => setReaderLayout('translated')}
                >
                  Traduit
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {queue[activeFileIndex]?.downloadUrl && (
                  <a href={queue[activeFileIndex].downloadUrl} download className="btn btn-success" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Download size={16} /> PDF
                  </a>
                )}
                {queue[activeFileIndex]?.epubUrl && (
                  <a href={queue[activeFileIndex].epubUrl} download className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#8b5cf6' }}>
                    <BookOpen size={16} /> EPUB
                  </a>
                )}
                {!queue[activeFileIndex]?.downloadUrl && !queue[activeFileIndex]?.epubUrl && (
                  <button className="btn" disabled style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px', backgroundColor: '#64748b' }}>
                    Non disponible
                  </button>
                )}
                {queue[activeFileIndex]?.taskId && (
                  <button onClick={() => openEreaderModal(queue[activeFileIndex].taskId, queue[activeFileIndex].name, queue[activeFileIndex].totalPages)} className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}>
                    <Tablet size={16} /> Liseuse
                  </button>
                )}
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}
                  onClick={() => {
                    setStep(1);
                    setQueue([]);
                    setActiveFileIndex(0);
                    setTaskId(null);
                    setGlossary([]);
                    setTotalPages(1);
                    setPreviewPage(1);
                  }}
                >
                  Nouveau Projet
                </button>
              </div>
            </div>

            {/* Corps de Lecture eBook avec Sidebar et Workspace */}
            <div className="reader-body">
              {/* Sidebar : Vos volumes traduits */}
              <div className="reader-sidebar">
                <div className="reader-sidebar-title">Documents traduits</div>
                <div className="reader-sidebar-list">
                  {queue.map((item, idx) => (
                    item.status === 'completed' && (
                      <button 
                        key={item.id} 
                        className={`reader-sidebar-item ${idx === activeFileIndex ? 'active' : ''}`}
                        onClick={() => {
                          setActiveFileIndex(idx);
                          setTaskId(item.taskId);
                          setTotalPages(item.totalPages);
                          setPreviewPage(1);
                        }}
                      >
                        <BookOpen size={16} />
                        <span className="reader-sidebar-item-name" title={item.name}>{item.name}</span>
                      </button>
                    )
                  ))}
                </div>
              </div>

              {/* Workspace de lecture active */}
              <div className={`reader-workspace ${readerLayout !== 'side-by-side' ? 'single-layout' : ''}`}>
                
                {/* Volet Original (EN) */}
                {(readerLayout === 'side-by-side' || readerLayout === 'original') && (
                  <div className="pane" style={{ borderRight: readerLayout === 'side-by-side' ? '2px solid #334155' : 'none' }}>
                    <span className="pane-label">Original (EN)</span>
                    <div className="pane-scrollable">
                      <img 
                        key={`orig-read-${previewPage}-${taskId}`}
                        src={`${API_BASE}/page/${taskId}/${previewPage}?translated=false`}
                        alt={`Page ${previewPage} originale`}
                        className="reader-img"
                        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                      />
                    </div>
                  </div>
                )}

                {/* Volet Traduit (FR) */}
                {(readerLayout === 'side-by-side' || readerLayout === 'translated') && (
                  <div className="pane">
                    <span className="pane-label" style={{ backgroundColor: 'var(--primary)' }}>Traduit (FR)</span>
                    
                    <div className="pane-scrollable">
                      <img 
                        key={`trans-read-${previewPage}-${taskId}`}
                        src={`${API_BASE}/page/${taskId}/${previewPage}?translated=true`}
                        alt={`Page ${previewPage} traduite`}
                        className="reader-img"
                        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {ereaderModal && (
        <div className="modal-overlay" onClick={() => setEreaderModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Tablet size={20} /> Envoyer à la liseuse</h3>
              <button className="modal-close" onClick={() => setEreaderModal(null)}>✕</button>
            </div>

            <div className="modal-body">
              <p className="modal-filename">{ereaderModal.fileName}</p>

              <div className="preview-comparison">
                <div className="preview-col">
                  <div className="preview-label">Original (100dpi, 95%)</div>
                  <img
                    src={`${API_BASE}/epub/preview/${ereaderModal.taskId}?quality=95&dpi=100&grayscale=0&page=${previewSamplePage}`}
                    alt="Original"
                    className="preview-img"
                  />
                </div>
                <div className="preview-col">
                  <div className="preview-label">Compressé ({compressDpi}dpi, {compressQuality}%){compressGrayscale ? ', Gris' : ''}</div>
                  <img
                    key={`comp-${compressQuality}-${compressDpi}-${compressGrayscale}`}
                    src={`${API_BASE}/epub/preview/${ereaderModal.taskId}?quality=${compressQuality}&dpi=${compressDpi}&grayscale=${compressGrayscale ? "1" : "0"}&page=${previewSamplePage}`}
                    alt="Compressé"
                    className="preview-img"
                  />
                </div>
              </div>

              <div className="size-comparison-bar">
                <div className="size-item">
                  <span className="size-label">Original</span>
                  <span className="size-value">~{estimatedSize ? (estimatedSize / 1024 / 1024).toFixed(1) : '?'} Mo</span>
                </div>
                <div className="size-item compressed">
                  <span className="size-label">Compressé</span>
                  <span className="size-value">
                    {compressedEpubResult
                      ? (compressedEpubResult.compressed_size / 1024 / 1024).toFixed(1)
                      : estimatedSize
                        ? (estimatedSize / 1024 / 1024).toFixed(1)
                        : '?'} Mo
                    {compressedEpubResult && compressedEpubResult.reduction_pct > 1 && (
                      <span className="reduction-badge">-{compressedEpubResult.reduction_pct}%</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="compress-settings">
                <div className="setting-row">
                  <label>Qualité JPEG</label>
                  <input
                    type="range"
                    min="60"
                    max="95"
                    step="5"
                    value={compressQuality}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setCompressQuality(v);
                      fetchEstimate(ereaderModal.taskId, v, compressDpi, compressGrayscale);
                    }}
                    className="quality-slider"
                  />
                  <span className="setting-value">{compressQuality}%</span>
                </div>
                <div className="setting-row">
                  <label>DPI</label>
                  <div className="dpi-buttons">
                    {[72, 100, 150].map(d => (
                      <button
                        key={d}
                        className={`dpi-btn ${compressDpi === d ? 'active' : ''}`}
                        onClick={() => {
                          setCompressDpi(d);
                          fetchEstimate(ereaderModal.taskId, compressQuality, d, compressGrayscale);
                        }}
                      >{d}</button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <label>Couleur</label>
                  <div className="grayscale-toggle">
                    <button
                      className={`toggle-btn ${!compressGrayscale ? 'active' : ''}`}
                      onClick={() => {
                        setCompressGrayscale(false);
                        fetchEstimate(ereaderModal.taskId, compressQuality, compressDpi, false);
                      }}
                    >Couleur</button>
                    <button
                      className={`toggle-btn ${compressGrayscale ? 'active' : ''}`}
                      onClick={() => {
                        setCompressGrayscale(true);
                        fetchEstimate(ereaderModal.taskId, compressQuality, compressDpi, true);
                      }}
                    >Niveaux de gris</button>
                  </div>
                </div>
              </div>

              {compressedEpubResult ? (
                <div className="compress-result">
                  <div className="result-row">
                    <span>Fichier compressé</span>
                    <strong>{(compressedEpubResult.compressed_size / 1024 / 1024).toFixed(1)} Mo</strong>
                    {compressedEpubResult.original_size && (
                      <span className="reduction-badge">
                        -{compressedEpubResult.reduction_pct}% ({(compressedEpubResult.original_size / 1024 / 1024).toFixed(1)} Mo → {(compressedEpubResult.compressed_size / 1024 / 1024).toFixed(1)} Mo)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => sendToEreader(ereaderModal.taskId, true)}
                    className="btn btn-success"
                    disabled={ereaderSending === ereaderModal.taskId}
                    style={{ width: '100%', marginTop: '12px' }}
                  >
                    <Tablet size={18} /> {ereaderSending === ereaderModal.taskId ? 'Envoi...' : 'Envoyer à la liseuse'}
                  </button>
                </div>
              ) : (
                <button
                  onClick={doCompress}
                  className="btn btn-primary"
                  disabled={isCompressing}
                  style={{ width: '100%', marginTop: '16px' }}
                >
                  {isCompressing ? 'Compression en cours...' : 'Générer l\'EPUB avec ces réglages'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
