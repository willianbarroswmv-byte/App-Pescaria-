/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  FolderOpen, 
  ZapOff,
  ChevronLeft,
  Save,
  Play,
  CloudSun,
  Waves,
  Thermometer,
  MapPin,
  Sparkles,
  Fish,
  Scale,
  Navigation,
  Share2,
  BrainCircuit,
  Moon,
  Anchor,
  BarChart3,
  BookOpen,
  Map as MapIcon,
  Plus,
  Target,
  Power,
  Mic,
  CheckSquare,
  History,
  Wind,
  Compass,
  LayoutDashboard,
  AlertTriangle,
  Settings2,
  Trash2,
  Edit2,
  X,
  CheckCircle2,
  Download,
  User,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { saveVideo, getVideo, clearAllVideos, deleteVideo } from './db';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Types
interface CatchDetails {
  species?: string;
  weight?: string;
  bait?: string;
  location?: { lat: number; lng: number };
  weather?: string;
  moonPhase?: string;
  notes?: string;
}

interface Recording {
  id: string;
  url: string;
  timestamp: number;
  duration: number;
  size: string;
  type: 'clip' | 'timelapse' | 'slowmo';
  details?: CatchDetails;
  aiAnalysis?: string;
}

interface Hotspot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  note: string;
  category: 'Peixe' | 'Perigo' | 'Rampa' | 'Ponto';
  timestamp: number;
}

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

// Map Events Component
function MapEvents({ setPendingHotspot, setMapCenter, mapCenter }: { 
  setPendingHotspot: (pos: { lat: number; lng: number } | null) => void;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number]>>;
  mapCenter: [number, number];
}) {
  const map = useMapEvents({
    click(e) {
      setPendingHotspot({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    moveend() {
      const center = map.getCenter();
      setMapCenter(prev => {
        const isSame = Math.abs(prev[0] - center.lat) < 0.00001 && 
                       Math.abs(prev[1] - center.lng) < 0.00001;
        if (isSame) return prev;
        return [center.lat, center.lng];
      });
    }
  });
  
  useEffect(() => {
    const currentCenter = map.getCenter();
    const isSame = Math.abs(currentCenter.lat - mapCenter[0]) < 0.00001 && 
                   Math.abs(currentCenter.lng - mapCenter[1]) < 0.00001;
    if (!isSame) {
      map.setView(mapCenter);
    }
  }, [mapCenter, map]);

  return null;
}

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<'home' | 'camera' | 'gallery' | 'map' | 'tools' | 'settings'>('home');
  const [isLoopActive, setIsLoopActive] = useState(false);
  const [isStandardRecording, setIsStandardRecording] = useState(false);
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Data States
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [replayDuration, setReplayDuration] = useState<30 | 60 | 120 | 300>(120);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({
    'Embarcada': [
      { id: '1', text: 'Varas e Carretilhas', checked: false },
      { id: '2', text: 'Caixa de Iscas', checked: false },
      { id: '3', text: 'Bateria do Motor Elétrico', checked: false },
      { id: '4', text: 'Colete Salva-vidas', checked: false },
      { id: '5', text: 'Gelo e Bebidas', checked: false },
    ],
    'Barranco': [
      { id: '6', text: 'Cadeira de Pesca', checked: false },
      { id: '7', text: 'Suporte de Vara', checked: false },
      { id: '8', text: 'Isca Viva/Massa', checked: false },
    ]
  });

  // Camera States
  const [cameraQuality, setCameraQuality] = useState<'4K' | '1080p' | '720p'>('1080p');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isFullFrame, setIsFullFrame] = useState(false);
  const [mode, setMode] = useState<'normal' | 'timelapse' | 'slowmo'>('normal');
  const [showCatchModal, setShowCatchModal] = useState<string | null>(null);
  const [pendingHotspot, setPendingHotspot] = useState<{ lat: number; lng: number } | null>(null);
  const [newHotspotName, setNewHotspotName] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([-23.5505, -46.6333]);
  const [mapType, setMapType] = useState<'street' | 'satellite' | 'radar'>('satellite');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ lat: number; lng: number; timestamp: number }[]>([]);
  const [isTrackingPath, setIsTrackingPath] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string>("");
  const [isEditingChecklist, setIsEditingChecklist] = useState(false);
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]); 
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const shouldSaveRef = useRef(false);

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  // Constants
  const CHUNK_DURATION_MS = 5000; // 5s segments for better granularity in loop

  // Data Persistence
  useEffect(() => {
    try {
      const savedHotspots = localStorage.getItem('fishcapture_hotspots');
      if (savedHotspots) setHotspots(JSON.parse(savedHotspots));
      
      const savedRecordings = localStorage.getItem('fishcapture_recordings');
      if (savedRecordings) setRecordings(JSON.parse(savedRecordings));

      const savedChecklists = localStorage.getItem('fishcapture_checklists');
      if (savedChecklists) setChecklists(JSON.parse(savedChecklists));

      const savedContact = localStorage.getItem('fishcapture_emergency_contact');
      if (savedContact) setEmergencyContact(savedContact);
    } catch (e) {
      console.error("Failed to load data from localStorage", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('fishcapture_hotspots', JSON.stringify(hotspots));
  }, [hotspots]);

  useEffect(() => {
    localStorage.setItem('fishcapture_recordings', JSON.stringify(recordings));
  }, [recordings]);

  useEffect(() => {
    localStorage.setItem('fishcapture_checklists', JSON.stringify(checklists));
  }, [checklists]);

  useEffect(() => {
    localStorage.setItem('fishcapture_emergency_contact', emergencyContact);
  }, [emergencyContact]);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const getStream = async (quality: '4K' | '1080p' | '720p') => {
        const constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: quality === '4K' ? 3840 : quality === '1080p' ? 1920 : 1280 },
            height: { ideal: quality === '4K' ? 2160 : quality === '1080p' ? 1080 : 720 },
          },
          audio: true
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
      };

      let stream;
      try {
        stream = await getStream(cameraQuality);
      } catch (err) {
        console.warn(`Failed to get camera at ${cameraQuality}, falling back to 720p`, err);
        stream = await getStream('720p');
      }

      if (videoRef.current) videoRef.current.srcObject = stream;
      streamRef.current = stream;
      
      // If loop was active, restart recorder with new stream
      if (isLoopActive) {
        startMediaRecorder(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
      alert("Erro ao acessar a câmera. Verifique as permissões nas configurações do seu navegador/celular.");
    }
  }, [cameraQuality, facingMode, isLoopActive]);

  // Load videos from IndexedDB
  useEffect(() => {
    const loadVideos = async () => {
      const updatedRecordings = await Promise.all(recordings.map(async (rec) => {
        if (rec.url.startsWith('blob:')) return rec; // Already has a valid URL in this session
        const blob = await getVideo(rec.id);
        if (blob) {
          return { ...rec, url: URL.createObjectURL(blob) };
        }
        return rec;
      }));
      
      // Only update if URLs actually changed to avoid infinite loop
      const hasChanges = updatedRecordings.some((rec, i) => rec.url !== recordings[i].url);
      if (hasChanges) {
        setRecordings(updatedRecordings);
      }
    };

    if (recordings.length > 0) {
      loadVideos();
    }
  }, [recordings.length]); // Only run when the list size changes or on mount

  const voiceStateRef = useRef<any>({});
  useEffect(() => {
    voiceStateRef.current = {
      isLoopActive,
      isStandardRecording,
      handleSaveReplay: () => {
        // Dispatch custom event to trigger save replay safely
        document.dispatchEvent(new CustomEvent('trigger-save-replay'));
      },
      saveHotspot: (cat: any) => {
        document.dispatchEvent(new CustomEvent('trigger-save-hotspot', { detail: cat }));
      },
      setActiveTab: (tab: any) => {
        document.dispatchEvent(new CustomEvent('trigger-set-active-tab', { detail: tab }));
      }
    };
  });

  // Voice Commands
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any = null;
    let isComponentMounted = true;

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'pt-BR';
      recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.toLowerCase();
        
        const isSaveCommand = text.includes('salvar gravação') || text.includes('salvando gravação');
        const isHotspotCommand = text.includes('marcar ponto') || text.includes('marcar local');
        const isCatchCommand = text.includes('registrar captura') || text.includes('peguei um peixe');

        if (isSaveCommand || isHotspotCommand || isCatchCommand) {
          // Visual feedback ONLY for valid commands
          const flash = document.createElement('div');
          flash.className = 'fixed inset-0 bg-emerald-500/20 z-[4000] pointer-events-none animate-pulse';
          document.body.appendChild(flash);
          setTimeout(() => flash.remove(), 500);

          if (isSaveCommand) {
            if (voiceStateRef.current.isLoopActive || voiceStateRef.current.isStandardRecording) {
              voiceStateRef.current.handleSaveReplay();
            }
          } else if (isHotspotCommand) {
            voiceStateRef.current.saveHotspot('Ponto');
          } else if (isCatchCommand) {
            voiceStateRef.current.setActiveTab('camera');
            if (voiceStateRef.current.isLoopActive || voiceStateRef.current.isStandardRecording) {
              voiceStateRef.current.handleSaveReplay();
            }
          }
        }
      };
      recognition.onstart = () => setIsListening(true);
      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.error('Speech recognition error', event.error);
        }
        if (event.error === 'not-allowed') setIsListening(false);
      };
      recognition.onend = () => { 
        setIsListening(false);
        if (isComponentMounted && (voiceStateRef.current.isLoopActive || voiceStateRef.current.isStandardRecording)) {
          setTimeout(() => {
            if (isComponentMounted) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore already started errors
              }
            }
          }, 100);
        }
      };
      recognitionRef.current = recognition;
    }

    return () => {
      isComponentMounted = false;
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {}
      }
    };
  }, []); // Run only once on mount

  const startMediaRecorder = (isLoop: boolean) => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    
    let recorder: MediaRecorder;
    try {
      // Use a supported mime type
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') 
        ? 'video/webm;codecs=vp8,opus' 
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : ''; // Let browser choose default
        
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    } catch (e) {
      console.error("Failed to create MediaRecorder:", e);
      return;
    }
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = async () => {
      const shouldSave = shouldSaveRef.current;
      shouldSaveRef.current = false;

      if (!shouldSave) {
        // Restart recorder if loop is still active and this is still the active recorder
        if (voiceStateRef.current.isLoopActive && streamRef.current && mediaRecorderRef.current === recorder) {
          chunksRef.current = [];
          try {
            recorder.start(CHUNK_DURATION_MS);
          } catch (e) {
            console.error("Failed to restart recorder:", e);
          }
        }
        return;
      }

      if (chunksRef.current.length === 0) return;
      
      const id = Math.random().toString(36).substr(2, 9);
      const blobType = chunksRef.current[0]?.type || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: blobType });
      const url = URL.createObjectURL(blob);
      
      try {
        await saveVideo(id, blob);
      } catch (err) {
        console.error("Failed to save video to IndexedDB:", err);
        const toast = document.getElementById('saving-toast');
        if (toast) toast.remove();
        alert("Erro ao salvar o vídeo. O armazenamento pode estar cheio.");
        return;
      }
      
      const finalizeSave = (pos?: GeolocationPosition) => {
        const toast = document.getElementById('saving-toast');
        if (toast) toast.remove();

        const newRecording: Recording = {
          id,
          url,
          timestamp: Date.now(),
          duration: chunksRef.current.length * (CHUNK_DURATION_MS / 1000), // Approximate
          size: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
          type: 'clip',
          details: pos ? {
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            weather: "24°C, Ensolarado",
            moonPhase: "Crescente"
          } : undefined
        };
        
        setRecordings(prev => [newRecording, ...prev]);
        setShowCatchModal(id);
        
        const successToast = document.createElement('div');
        successToast.className = 'fixed top-12 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-full font-bold shadow-xl z-[300] animate-bounce flex items-center gap-2';
        successToast.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Gravação Salva!';
        document.body.appendChild(successToast);
        setTimeout(() => successToast.remove(), 3000);
      };

      navigator.geolocation.getCurrentPosition(
        (pos) => finalizeSave(pos),
        (err) => {
          console.error("Geolocation error during replay save:", err);
          finalizeSave();
        },
        { timeout: 3000 }
      );

      // Restart recorder if loop is still active and this is still the active recorder
      if (voiceStateRef.current.isLoopActive && streamRef.current && mediaRecorderRef.current === recorder) {
        chunksRef.current = [];
        try {
          recorder.start(CHUNK_DURATION_MS);
        } catch (e) {
          console.error("Failed to restart recorder after save:", e);
        }
      }
    };
    
    recorder.start(isLoop ? CHUNK_DURATION_MS : undefined); 
    mediaRecorderRef.current = recorder;
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        // Recognition might already be started
      }
    }
  };

  const handleSaveReplay = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Immediate feedback
      const savingToast = document.createElement('div');
      savingToast.id = 'saving-toast';
      savingToast.className = 'fixed top-12 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full font-bold shadow-xl z-[300] flex items-center gap-3';
      savingToast.innerHTML = '<div class="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> Processando Vídeo...';
      document.body.appendChild(savingToast);

      // Stopping the recorder triggers the onstop event which handles the actual saving
      shouldSaveRef.current = true;
      mediaRecorderRef.current.stop();
      if (isStandardRecording) {
        setIsStandardRecording(false);
      }
    } else {
      const errorToast = document.createElement('div');
      errorToast.className = 'fixed top-12 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-xl z-[300]';
      errorToast.innerText = 'A câmera não está gravando.';
      document.body.appendChild(errorToast);
      setTimeout(() => errorToast.remove(), 3000);
    }
  };

  const saveHotspot = (category: Hotspot['category'], name?: string, coords?: { lat: number; lng: number }) => {
    const finalize = (lat: number, lng: number) => {
      setHotspots(prev => {
        const newSpot: Hotspot = {
          id: Math.random().toString(36).substr(2, 9),
          name: name || `${category} #${prev.length + 1}`,
          lat,
          lng,
          category,
          note: "",
          timestamp: Date.now()
        };
        return [newSpot, ...prev];
      });
      setPendingHotspot(null);
      setNewHotspotName("");
    };

    if (coords) {
      finalize(coords.lat, coords.lng);
    } else {
      navigator.geolocation.getCurrentPosition((pos) => {
        finalize(pos.coords.latitude, pos.coords.longitude);
      }, (err) => {
        console.error("Geolocation error during hotspot save:", err);
        alert("Não foi possível obter sua localização. O ponto será salvo na posição central do mapa.");
        finalize(mapCenter[0], mapCenter[1]);
      });
    }
  };

  // Event listeners for voice commands to avoid stale closures
  useEffect(() => {
    const handleSaveReplayEvent = () => handleSaveReplay();
    const handleSaveHotspotEvent = (e: any) => saveHotspot(e.detail);
    const handleSetActiveTabEvent = (e: any) => setActiveTab(e.detail);

    document.addEventListener('trigger-save-replay', handleSaveReplayEvent);
    document.addEventListener('trigger-save-hotspot', handleSaveHotspotEvent);
    document.addEventListener('trigger-set-active-tab', handleSetActiveTabEvent);

    return () => {
      document.removeEventListener('trigger-save-replay', handleSaveReplayEvent);
      document.removeEventListener('trigger-save-hotspot', handleSaveHotspotEvent);
      document.removeEventListener('trigger-set-active-tab', handleSetActiveTabEvent);
    };
  }, [handleSaveReplay, saveHotspot, setActiveTab]);

  const toggleChecklist = (category: string, id: string) => {
    setChecklists(prev => ({
      ...prev,
      [category]: prev[category].map(item => item.id === id ? { ...item, checked: !item.checked } : item)
    }));
  };

  const addChecklistItem = (category: string) => {
    const text = prompt("Novo item:");
    if (!text) return;
    setChecklists(prev => ({
      ...prev,
      [category]: [...prev[category], { id: Math.random().toString(36).substr(2, 9), text, checked: false }]
    }));
  };

  const removeChecklistItem = (category: string, id: string) => {
    setChecklists(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== id)
    }));
  };

  const editChecklistItem = (category: string, id: string) => {
    const item = checklists[category].find(i => i.id === id);
    if (!item) return;
    const newText = prompt("Editar item:", item.text);
    if (!newText) return;
    setChecklists(prev => ({
      ...prev,
      [category]: prev[category].map(i => i.id === id ? { ...i, text: newText } : i)
    }));
  };

  const addChecklistCategory = () => {
    const name = prompt("Nome da nova categoria:");
    if (!name || checklists[name]) return;
    setChecklists(prev => ({ ...prev, [name]: [] }));
  };

  const removeChecklistCategory = (category: string) => {
    if (!confirm(`Excluir categoria "${category}"?`)) return;
    setChecklists(prev => {
      const next = { ...prev };
      delete next[category];
      return next;
    });
  };

  const renameChecklistCategory = (oldName: string) => {
    const newName = prompt("Novo nome da categoria:", oldName);
    if (!newName || newName === oldName || checklists[newName]) return;
    setChecklists(prev => {
      const next = { ...prev };
      next[newName] = next[oldName];
      delete next[oldName];
      return next;
    });
  };

  const sendEmergencyLocation = () => {
    if (!emergencyContact) {
      alert("Por favor, configure um número de WhatsApp para emergências.");
      return;
    }

    if (!confirm("Isso enviará sua localização atual para o contato de emergência via WhatsApp. Continuar?")) return;

    // Use a toast to show progress
    const toast = document.createElement('div');
    toast.className = 'fixed top-12 left-1/2 -translate-x-1/2 bg-zinc-800 text-white px-6 py-3 rounded-full font-bold shadow-xl z-[300] flex items-center gap-3';
    toast.innerHTML = '<div class="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div> Obtendo localização...';
    document.body.appendChild(toast);

    navigator.geolocation.getCurrentPosition((pos) => {
      toast.remove();
      const { latitude, longitude } = pos.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const message = `EMERGÊNCIA! Minha localização atual: ${mapsUrl}`;
      const whatsappUrl = `https://wa.me/${emergencyContact.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      
      // window.location.href is more reliable than window.open in async callbacks
      window.location.href = whatsappUrl;
    }, (err) => {
      toast.remove();
      alert("Erro ao obter localização: " + err.message);
    }, { enableHighAccuracy: true, timeout: 5000 });
  };

  // Navigation Helpers
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const λ1 = lon1 * Math.PI/180;
    const λ2 = lon2 * Math.PI/180;
    const y = Math.sin(λ2-λ1) * Math.cos(φ2);
    const x = Math.cos(φ1)*Math.sin(φ2) -
            Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2-λ1);
    const θ = Math.atan2(y, x);
    return (θ*180/Math.PI + 360) % 360;
  };

  // Geolocation and Tracking
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        
        if (isTrackingPath) {
          setBreadcrumbs(prev => {
            const last = prev[prev.length - 1];
            if (!last || getDistance(last.lat, last.lng, latitude, longitude) > 5) {
              return [...prev, { lat: latitude, lng: longitude, timestamp: Date.now() }];
            }
            return prev;
          });
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTrackingPath]);

  // Device Orientation & Network Status
  useEffect(() => {
    const handleOrientation = (e: any) => {
      if (e.webkitCompassHeading) {
        setUserHeading(e.webkitCompassHeading);
      } else if (e.alpha) {
        setUserHeading(360 - e.alpha);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => {
      setIsOffline(true);
      setMapType('radar'); // Auto-switch to radar when offline
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Camera Management
  useEffect(() => {
    const shouldCameraBeOn = activeTab === 'camera' || isLoopActive || isStandardRecording;
    
    if (shouldCameraBeOn && !streamRef.current) {
      startCamera();
    } else if (!shouldCameraBeOn && streamRef.current) {
      // Stop camera only if we are not on camera tab AND not recording
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [activeTab, isLoopActive, isStandardRecording, startCamera]);

  useEffect(() => {
    if (activeTab === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [activeTab]);

  return (
    <div className="mobile-container font-sans bg-zinc-950 text-zinc-100">
      {/* Stealth Mode Overlay */}
      <AnimatePresence>
        {isStealthMode && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="stealth-overlay" onClick={() => setIsStealthMode(false)}
          >
            <div className="flex flex-col items-center gap-6">
              <div className="w-2 h-2 bg-red-600 rounded-full animate-ping" />
              <span className="text-zinc-800 text-[10px] font-mono tracking-widest">ASSISTENTE EM STANDBY</span>
              {isLoopActive && (
                <div className="flex items-center gap-2 text-emerald-500/30 text-[8px] font-bold uppercase">
                  <Mic size={12} />
                  <span>Ouvindo: "Salvar Gravação"</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="relative flex-1 flex flex-col overflow-hidden">
        
        {/* PERSISTENT MAP BACKGROUND */}
        <div className={`absolute inset-0 z-0 transition-opacity duration-500 ${(activeTab === 'map' || activeTab === 'home') ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="h-full relative overflow-hidden">
            {mapType !== 'radar' ? (
              <div className="absolute inset-0">
                <MapContainer 
                  center={mapCenter} 
                  zoom={15} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url={mapType === 'street' 
                      ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    }
                    attribution='&copy; Esri'
                  />
                  <MapEvents 
                    setPendingHotspot={setPendingHotspot} 
                    setMapCenter={setMapCenter} 
                    mapCenter={mapCenter} 
                  />
                  
                  {/* User Marker */}
                  {userLocation && (
                    <Marker 
                      position={[userLocation.lat, userLocation.lng]}
                      icon={L.divIcon({
                        className: 'custom-div-icon',
                        html: `<div class="relative">
                          <div class="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_20px_rgba(59,130,246,0.8)]"></div>
                          <div class="absolute -inset-2 bg-blue-500/20 rounded-full animate-ping"></div>
                          ${userHeading ? `<div class="absolute -top-8 left-1/2 -translate-x-1/2 transition-transform duration-500" style="transform: rotate(${userHeading}deg)">
                            <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[16px] border-b-blue-500"></div>
                          </div>` : ''}
                        </div>`,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                      })}
                    />
                  )}

                  {hotspots.map((spot) => (
                    <Marker 
                      key={spot.id} 
                      position={[spot.lat, spot.lng]}
                      eventHandlers={{
                        click: () => setSelectedHotspotId(spot.id)
                      }}
                    >
                      <Popup>
                        <div className="text-zinc-900 p-1 min-w-[120px]">
                          <p className="font-bold text-sm mb-1">{spot.name}</p>
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-emerald-600 font-bold uppercase">{spot.category}</span>
                            <button 
                              onClick={() => setSelectedHotspotId(spot.id)}
                              className="bg-emerald-600 text-white px-2 py-1 rounded-md font-bold"
                            >
                              NAVEGAR
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-8">
                <div className="relative w-64 h-64 border border-emerald-500/20 rounded-full flex items-center justify-center">
                  <div className="absolute inset-0 border border-emerald-500/10 rounded-full scale-75" />
                  <div className="absolute inset-0 border border-emerald-500/5 rounded-full scale-50" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent rounded-full animate-[spin_4s_linear_infinite]" />
                  
                  {/* User in Radar */}
                  <div className="relative z-10">
                    <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-[0_0_20px_rgba(59,130,246,0.6)]" />
                    {userHeading && (
                      <div 
                        className="absolute -top-10 left-1/2 -translate-x-1/2 transition-transform duration-500"
                        style={{ transform: `rotate(${userHeading}deg)` }}
                      >
                        <Navigation size={20} className="text-blue-400 fill-blue-400" />
                      </div>
                    )}
                  </div>

                  {/* Hotspots on Radar */}
                  {userLocation && hotspots.map(spot => {
                    const dLat = (spot.lat - userLocation.lat) * 111320; 
                    const dLng = (spot.lng - userLocation.lng) * 111320 * Math.cos(userLocation.lat * Math.PI / 180);
                    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
                    const maxRadarDist = 1500; 
                    const scale = Math.min(dist / maxRadarDist, 1);
                    const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
                    const isSelected = selectedHotspotId === spot.id;
                    
                    return (
                      <motion.button
                        key={spot.id}
                        onClick={() => setSelectedHotspotId(spot.id)}
                        className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 z-20"
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${-scale * 50}%) rotate(${-angle}deg)`
                        }}
                      >
                        <div className={`w-full h-full rounded-full shadow-lg transition-all ${isSelected ? 'bg-white scale-150 shadow-white/50' : 'bg-emerald-500 shadow-emerald-500/50'}`} />
                        <span className={`absolute top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap ${isSelected ? 'text-white' : 'text-emerald-500'}`}>
                          {spot.name} ({dist > 1000 ? (dist/1000).toFixed(1)+'km' : dist.toFixed(0)+'m'})
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                
                <div className="mt-12 text-center space-y-4">
                  <div className="flex items-center justify-center gap-6">
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">Velocidade</p>
                      <p className="text-xl font-display font-bold text-white">0.0 <span className="text-[10px]">km/h</span></p>
                    </div>
                    <div className="w-[1px] h-8 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[10px] text-zinc-500 font-bold uppercase">Rumo</p>
                      <p className="text-xl font-display font-bold text-white">{userHeading ? Math.round(userHeading) : '---'}°</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-600 max-w-[240px]">Modo Radar: Navegação 100% offline baseada em sensores internos.</p>
                </div>
              </div>
            )}

            {/* Crosshair for "Drag and Mark" precision */}
            {mapType !== 'radar' && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
                <div className="w-8 h-8 border-2 border-white/30 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-white rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PERSISTENT MAP CONTROLS */}
        <AnimatePresence>
          {(activeTab === 'map' || activeTab === 'home') && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="absolute bottom-6 right-6 flex flex-col gap-3 z-[1000]"
            >
              <button 
                onClick={() => setIsTrackingPath(!isTrackingPath)}
                className={`p-4 rounded-2xl border border-white/10 shadow-2xl transition-all ${isTrackingPath ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-400'}`}
              >
                <Anchor size={24} />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" style={{ display: isTrackingPath ? 'block' : 'none' }} />
              </button>
              <button 
                onClick={() => {
                  if (userLocation) setMapCenter([userLocation.lat, userLocation.lng]);
                }}
                className="bg-zinc-900 p-4 rounded-2xl border border-white/10 text-emerald-500 shadow-2xl active:scale-90 transition-transform"
              >
                <Compass size={24} />
              </button>
              <button 
                onClick={() => setPendingHotspot({ lat: mapCenter[0], lng: mapCenter[1] })}
                className="bg-emerald-600 p-4 rounded-2xl text-white shadow-2xl active:scale-95 transition-transform"
              >
                <Plus size={24} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success Modal */}
        <AnimatePresence>
          {showCatchModal && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="bg-zinc-900 border border-white/10 p-6 rounded-[40px] text-center w-full max-w-sm relative overflow-hidden"
              >
                <button 
                  onClick={() => setShowCatchModal(null)}
                  className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors z-10 bg-black/50 rounded-full p-2"
                >
                  <X size={20} />
                </button>
                
                {recordings.find(r => r.id === showCatchModal) ? (
                  <div className="mb-6 rounded-2xl overflow-hidden bg-black aspect-video relative">
                    <video 
                      src={recordings.find(r => r.id === showCatchModal)?.url} 
                      className="w-full h-full object-contain" 
                      controls
                      playsInline
                      autoPlay
                    />
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-500 mt-4">
                    <CheckCircle2 size={40} />
                  </div>
                )}
                
                <h3 className="text-xl font-bold mb-2">Captura Salva!</h3>
                <p className="text-sm text-zinc-400 mb-6">O vídeo foi salvo no seu Diário e no armazenamento do dispositivo.</p>
                
                {recordings.find(r => r.id === showCatchModal) && (
                  <div className="flex gap-2 mb-6">
                    <button 
                      onClick={() => {
                        const rec = recordings.find(r => r.id === showCatchModal);
                        if (rec) {
                          const a = document.createElement('a');
                          a.href = rec.url;
                          a.download = `captura-${rec.id}.webm`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }
                      }}
                      className="flex-1 bg-zinc-800 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-700 transition-colors"
                    >
                      <Download size={16} /> GALERIA
                    </button>
                    <button 
                      onClick={async () => {
                        const rec = recordings.find(r => r.id === showCatchModal);
                        if (rec) {
                          try {
                            if (navigator.share) {
                              try {
                                const response = await fetch(rec.url);
                                const blob = await response.blob();
                                const file = new File([blob], `captura-${rec.id}.webm`, { type: blob.type });
                                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                  await navigator.share({
                                    title: `Captura #${rec.id}`,
                                    text: 'Olha essa captura no FishCapture Pro!',
                                    files: [file]
                                  });
                                  return;
                                }
                              } catch (e) {
                                console.log("File sharing not supported, falling back to text");
                              }
                              await navigator.share({
                                title: `Captura #${rec.id}`,
                                text: 'Olha essa captura no FishCapture Pro!',
                                url: window.location.href
                              });
                            } else {
                              alert("Compartilhamento não suportado neste navegador.");
                            }
                          } catch (err) {
                            console.error("Error sharing:", err);
                          }
                        }
                      }}
                      className="flex-1 bg-zinc-800 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-700 transition-colors"
                    >
                      <Share2 size={16} /> COMPARTILHAR
                    </button>
                  </div>
                )}

                <button 
                  onClick={() => setShowCatchModal(null)}
                  className="w-full bg-emerald-600 py-4 rounded-2xl font-bold uppercase tracking-widest active:scale-95 transition-transform"
                >
                  CONTINUAR PESCANDO
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Naming Modal */}
        <AnimatePresence>
          {pendingHotspot && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 left-6 right-6 bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-6 rounded-[32px] shadow-2xl z-[2000]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                  <Anchor size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Novo Hotspot</h3>
                  <p className="text-[10px] text-zinc-500">Defina o nome do seu ponto secreto</p>
                </div>
              </div>
              <input 
                autoFocus
                type="text" 
                placeholder="Ex: Toca do Robalo, Pedra Grande..."
                className="w-full bg-zinc-800 border border-white/5 rounded-2xl px-4 py-4 text-sm mb-4 outline-none focus:border-emerald-500 transition-colors"
                value={newHotspotName}
                onChange={(e) => setNewHotspotName(e.target.value)}
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingHotspot(null)}
                  className="flex-1 bg-zinc-800 py-4 rounded-2xl text-[10px] font-bold text-zinc-400 uppercase tracking-widest"
                >
                  CANCELAR
                </button>
                <button 
                  onClick={() => saveHotspot('Ponto', newHotspotName, pendingHotspot)}
                  className="flex-1 bg-emerald-600 py-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-emerald-600/20"
                >
                  SALVAR PONTO
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'home' && (
          <div className="h-full p-6 space-y-8 overflow-y-auto relative z-10 bg-zinc-950/40 backdrop-blur-sm">
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-display font-bold flex items-center gap-2">
                  FishCapture Pro
                  {isOffline && <span className="text-[9px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full border border-red-500/30">OFFLINE</span>}
                </h1>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Assistente Inteligente</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-white/5 flex items-center justify-center">
                <Settings2 size={20} className="text-zinc-400" />
              </div>
            </header>

            {/* Quick Actions Bento Grid */}
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => { 
                  setActiveTab('camera'); 
                  if (isStandardRecording) {
                    shouldSaveRef.current = true;
                    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                    setIsStandardRecording(false);
                  }
                  voiceStateRef.current.isLoopActive = true;
                  setIsLoopActive(true); 
                  startMediaRecorder(true); 
                }}
                className="col-span-2 bg-emerald-600 p-6 rounded-[32px] flex flex-col justify-between h-40 relative overflow-hidden group active:scale-95 transition-transform"
              >
                <div className="relative z-10">
                  <History size={32} className="mb-4" />
                  <h3 className="text-xl font-bold">Replay da Captura</h3>
                  <p className="text-xs text-emerald-100/60">Salva os últimos {replayDuration}s</p>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
                  <ZapOff size={160} />
                </div>
                <div className="absolute top-6 right-6 flex items-center gap-2 bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  STANDBY
                </div>
              </button>

              <button 
                onClick={() => { setActiveTab('map'); setPendingHotspot({ lat: mapCenter[0], lng: mapCenter[1] }); }}
                className="bg-zinc-900 p-5 rounded-[32px] border border-white/5 flex flex-col gap-4 active:scale-95 transition-transform"
              >
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <MapPin size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-sm">Marcar Ponto</h4>
                  <p className="text-[10px] text-zinc-500">GPS Privado</p>
                </div>
              </button>

              <button 
                onClick={() => setActiveTab('camera')}
                className="bg-zinc-900 p-5 rounded-[32px] border border-white/5 flex flex-col gap-4 active:scale-95 transition-transform"
              >
                <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <Fish size={20} />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-sm">Registrar Peixe</h4>
                  <p className="text-[10px] text-zinc-500">Diário de Captura</p>
                </div>
              </button>
            </div>

            {/* Recent Captures Horizontal Scroll */}
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase">Últimos Momentos</h3>
                <button onClick={() => setActiveTab('gallery')} className="text-[10px] font-bold text-emerald-500 uppercase">Ver Tudo</button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 no-scrollbar">
                {recordings.length === 0 ? (
                  <div className="w-full bg-zinc-900/50 border border-dashed border-white/10 p-8 rounded-[32px] text-center">
                    <p className="text-xs text-zinc-600">Nenhuma captura registrada ainda.</p>
                  </div>
                ) : (
                  recordings.map(rec => (
                    <div key={rec.id} className="min-w-[240px] bg-zinc-900 rounded-[32px] border border-white/5 overflow-hidden">
                      <div className="aspect-video bg-black relative">
                        <video src={rec.url} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play size={24} className="text-white/50" />
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="font-bold text-sm">Captura #{rec.id}</p>
                        <p className="text-[10px] text-zinc-500">{new Date(rec.timestamp).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'camera' && (
          <>
            <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full ${isFullFrame ? 'object-contain bg-black' : 'object-cover'}`} />
            <div className="absolute inset-0 p-6 flex flex-col justify-between pointer-events-none">
              <div className="flex justify-between items-start pointer-events-auto">
                <div className="flex flex-col gap-2">
                  <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isLoopActive || isStandardRecording ? 'bg-red-500 animate-pulse' : 'bg-zinc-500'}`} />
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase">
                      {mode === 'normal' 
                        ? (isLoopActive ? `REPLAY ATIVO: ${replayDuration}s` : 'SISTEMA DESLIGADO')
                        : (isStandardRecording ? 'GRAVANDO' : 'PRONTO')}
                    </span>
                  </div>
                  <div className="glass-panel px-3 py-1 rounded-full text-[8px] font-bold text-zinc-400">
                    {cameraQuality} • {facingMode === 'environment' ? 'TRASEIRA' : 'FRONTAL'}
                  </div>
                  {isListening && (
                    <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-emerald-500">
                      <Mic size={12} className="animate-pulse" />
                      <span className="text-[8px] font-bold uppercase tracking-widest">Ouvindo Comandos</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
                    className="glass-panel p-3 rounded-full text-white active:scale-90 transition-transform"
                  >
                    <RefreshCw size={20} />
                  </button>
                  <button 
                    onClick={() => setIsFullFrame(!isFullFrame)}
                    className={`glass-panel p-3 rounded-full active:scale-90 transition-transform ${isFullFrame ? 'text-emerald-500' : 'text-white'}`}
                  >
                    <Scale size={20} />
                  </button>
                  <button onClick={() => setIsStealthMode(true)} className="glass-panel p-3 rounded-full text-zinc-300">
                    <ZapOff size={20} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-6 pointer-events-auto">
                <div className="flex justify-center gap-8 text-xs font-bold tracking-widest text-zinc-400">
                  {['SLOW-MO', 'VIDEO', 'LAPSE'].map((m) => (
                    <button 
                      key={m} 
                      onClick={() => {
                        if (isLoopActive) {
                          voiceStateRef.current.isLoopActive = false;
                          if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                          setIsLoopActive(false);
                        }
                        if (isStandardRecording) {
                          shouldSaveRef.current = true;
                          if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                          setIsStandardRecording(false);
                        }
                        setMode(m === 'VIDEO' ? 'normal' : m === 'LAPSE' ? 'timelapse' : 'slowmo');
                      }}
                      className={mode === (m === 'VIDEO' ? 'normal' : m === 'LAPSE' ? 'timelapse' : 'slowmo') ? 'text-emerald-500' : ''}
                    >{m}</button>
                  ))}
                </div>

                <div className="flex justify-between items-center px-4">
                  <div className="w-12 h-12 flex items-center justify-center">
                    <button onClick={() => setActiveTab('home')} className="glass-panel p-3 rounded-full text-zinc-400">
                      <ChevronLeft size={20} />
                    </button>
                  </div>

                  {mode === 'normal' ? (
                    <button 
                      onClick={() => {
                        if (isLoopActive) {
                          voiceStateRef.current.isLoopActive = false;
                          if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                          setIsLoopActive(false);
                        } else {
                          voiceStateRef.current.isLoopActive = true;
                          startMediaRecorder(true);
                          setIsLoopActive(true);
                        }
                      }}
                      className={`w-20 h-20 rounded-full border-4 transition-all flex items-center justify-center active:scale-90 ${isLoopActive ? 'border-emerald-500 bg-emerald-500/20' : 'border-white bg-zinc-800/50'}`}
                    >
                      <Power size={32} className={isLoopActive ? 'text-emerald-500' : 'text-white'} />
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        if (isStandardRecording) {
                          shouldSaveRef.current = true;
                          if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
                          setIsStandardRecording(false);
                        } else {
                          startMediaRecorder(false);
                          setIsStandardRecording(true);
                        }
                      }}
                      className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <div className={`transition-all duration-300 ${isStandardRecording ? 'w-8 h-8 rounded-sm bg-red-500' : 'w-14 h-14 rounded-full bg-red-500'}`} />
                    </button>
                  )}

                  <button 
                    onClick={handleSaveReplay} 
                    disabled={!isLoopActive}
                    className={`w-12 h-12 rounded-full glass-panel flex items-center justify-center ${!isLoopActive ? 'opacity-20' : 'text-emerald-500'}`}
                  >
                    <History size={20} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="h-full bg-zinc-950 p-6 space-y-8 overflow-y-auto">
            <header className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-display font-bold">Configurações</h1>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Ajustes do Sistema</p>
              </div>
            </header>

            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Qualidade de Gravação</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['720p', '1080p', '4K'] as const).map((q) => (
                  <button
                    key={q}
                    onClick={() => setCameraQuality(q)}
                    className={`py-3 rounded-2xl border font-bold text-xs transition-all ${cameraQuality === q ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 italic">Nota: 4K exige processamento intenso e pode não ser suportado em todos os dispositivos.</p>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Câmera Padrão</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setFacingMode('environment')}
                  className={`py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${facingMode === 'environment' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
                >
                  <Camera size={16} /> Traseira
                </button>
                <button
                  onClick={() => setFacingMode('user')}
                  className={`py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${facingMode === 'user' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500'}`}
                >
                  <User size={16} /> Frontal
                </button>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Permissões do Sistema</h3>
              <div className="space-y-2">
                {[
                  { id: 'camera', label: 'Câmera', icon: Camera },
                  { id: 'microphone', label: 'Microfone', icon: Mic },
                  { id: 'geolocation', label: 'Localização (GPS)', icon: MapIcon },
                ].map((p) => (
                  <div key={p.id} className="bg-zinc-900 p-4 rounded-3xl border border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <p.icon size={18} />
                      </div>
                      <span className="text-sm font-bold">{p.label}</span>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          if (p.id === 'camera' || p.id === 'microphone') {
                            await navigator.mediaDevices.getUserMedia({ [p.id]: true });
                          } else if (p.id === 'geolocation') {
                            navigator.geolocation.getCurrentPosition(() => {});
                          }
                          alert(`${p.label} autorizada com sucesso!`);
                        } catch (e) {
                          alert(`Erro ao solicitar ${p.label}. Verifique as configurações do sistema.`);
                        }
                      }}
                      className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full"
                    >
                      VERIFICAR
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Contato de Emergência</h3>
              <input 
                type="text" 
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="Nome ou Número"
                className="w-full bg-zinc-900 border border-white/5 rounded-2xl p-4 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </section>

            <div className="pt-8 pb-20 text-center">
              <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-bold">FishCapture Pro v2.1.0</p>
              <p className="text-[10px] text-zinc-800 mt-1">Desenvolvido para pescadores profissionais</p>
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="h-full flex flex-col relative z-10">
            <header className="p-4 flex justify-between items-center border-b border-white/5 bg-zinc-950/80 backdrop-blur-md z-20">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveTab('home')} className="p-2 -ml-2 text-zinc-400"><ChevronLeft /></button>
                <div>
                  <h2 className="font-display font-bold text-lg flex items-center gap-2">
                    Navegação
                    {isOffline && <span className="text-[9px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded-full border border-red-500/30">OFFLINE</span>}
                  </h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                    {isOffline ? 'GPS VIA SATÉLITE (RADAR)' : 'GPS DE PRECISÃO'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="bg-zinc-900 p-1 rounded-xl border border-white/5 flex">
                  {(['street', 'satellite', 'radar'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        if (isOffline && t !== 'radar') {
                          alert("Mapas online indisponíveis sem conexão. O Modo Radar (GPS via satélite) continuará funcionando.");
                          return;
                        }
                        setMapType(t);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${mapType === t ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-500'} ${isOffline && t !== 'radar' ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      {t === 'street' ? 'MAPA' : t === 'satellite' ? 'SAT' : 'RADAR'}
                    </button>
                  ))}
                </div>
              </div>
            </header>
            
            <div className="flex-1 relative pointer-events-none">
              {/* Navigation Overlay (Floating Arrow) */}
              {selectedHotspotId && userLocation && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="bg-black/60 backdrop-blur-xl border border-emerald-500/30 px-6 py-4 rounded-[32px] flex flex-col items-center gap-2 shadow-2xl"
                  >
                    {(() => {
                      const target = hotspots.find(h => h.id === selectedHotspotId);
                      if (!target) return null;
                      const dist = getDistance(userLocation.lat, userLocation.lng, target.lat, target.lng);
                      const bearing = getBearing(userLocation.lat, userLocation.lng, target.lat, target.lng);
                      const relativeBearing = userHeading ? (bearing - userHeading + 360) % 360 : bearing;
                      
                      return (
                        <>
                          <div className="flex items-center gap-3">
                            <div 
                              className="transition-transform duration-300"
                              style={{ transform: `rotate(${relativeBearing}deg)` }}
                            >
                              <Navigation size={32} className="text-emerald-500 fill-emerald-500" />
                            </div>
                            <div className="text-center">
                              <p className="text-2xl font-display font-bold text-white">
                                {dist > 1000 ? (dist/1000).toFixed(1)+'km' : dist.toFixed(0)+'m'}
                              </p>
                              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">{target.name}</p>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedHotspotId(null); }}
                            className="pointer-events-auto text-[8px] text-zinc-500 font-bold uppercase tracking-widest mt-1"
                          >
                            Parar Navegação
                          </button>
                        </>
                      );
                    })()}
                  </motion.div>
                </div>
              )}
            </div>

            {/* Points List with Distance */}
            <div className="bg-zinc-950/90 backdrop-blur-md border-t border-white/5 p-4 max-h-[220px] overflow-y-auto z-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Meus Pontos Secretos</h3>
                <div className="flex gap-2">
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{hotspots.length} PONTOS</span>
                  {isTrackingPath && <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">TRILHA ATIVA</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {hotspots.length === 0 ? (
                  <div className="bg-zinc-900/30 border border-dashed border-white/5 p-6 rounded-2xl text-center">
                    <p className="text-[10px] text-zinc-600 italic">Toque no mapa ou use o botão "+" para marcar um local.</p>
                  </div>
                ) : (
                  hotspots.map(spot => {
                    const dist = userLocation ? getDistance(userLocation.lat, userLocation.lng, spot.lat, spot.lng) : null;
                    const isSelected = selectedHotspotId === spot.id;
                    
                    return (
                      <div 
                        key={spot.id} 
                        className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${isSelected ? 'bg-emerald-600/10 border-emerald-500/50' : 'bg-zinc-900/50 border-white/5'}`}
                      >
                        <button 
                          onClick={() => setMapCenter([spot.lat, spot.lng])}
                          className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500"
                        >
                          <Target size={18} />
                        </button>
                        <div className="flex-1 text-left">
                          <p className="font-bold text-xs">{spot.name}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[8px] text-zinc-500">{new Date(spot.timestamp).toLocaleDateString()}</p>
                            {dist !== null && (
                              <span className="text-[8px] font-bold text-emerald-500">
                                • {dist > 1000 ? (dist/1000).toFixed(1)+'km' : dist.toFixed(0)+'m'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => setSelectedHotspotId(isSelected ? null : spot.id)}
                            className={`px-3 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-colors ${isSelected ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-emerald-500'}`}
                          >
                            {isSelected ? 'GUIANDO' : 'NAVEGAR'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="h-full flex flex-col p-6 space-y-8 overflow-y-auto">
            <header className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-display font-bold">Ferramentas</h2>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Checklists & Guias</p>
              </div>
              <button 
                onClick={() => setIsEditingChecklist(!isEditingChecklist)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${isEditingChecklist ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-white/5'}`}
              >
                {isEditingChecklist ? 'SALVAR' : 'EDITAR LISTA'}
              </button>
            </header>

            {(Object.entries(checklists) as [string, ChecklistItem[]][]).map(([category, items]) => (
              <section key={category} className="bg-zinc-900 rounded-[32px] p-6 border border-white/5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                    <CheckSquare size={14} /> Checklist: {category}
                  </h3>
                  {isEditingChecklist && (
                    <div className="flex gap-1">
                      <button onClick={() => addChecklistItem(category)} className="p-2 text-emerald-500 hover:text-emerald-400 transition-colors"><Plus size={18} /></button>
                      <button onClick={() => renameChecklistCategory(category)} className="p-2 text-zinc-500 hover:text-white transition-colors"><Edit2 size={18} /></button>
                      <button onClick={() => removeChecklistCategory(category)} className="p-2 text-red-500 hover:text-red-400 transition-colors"><Trash2 size={18} /></button>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 group">
                      <button 
                        onClick={() => toggleChecklist(category, item.id)}
                        className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                      >
                        <div className={`w-5 h-5 rounded-md border-2 transition-colors flex items-center justify-center ${item.checked ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-700'}`}>
                          {item.checked && <div className="w-2 h-2 bg-white rounded-full" />}
                        </div>
                        <span className={`text-sm font-medium ${item.checked ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>{item.text}</span>
                      </button>
                      {isEditingChecklist && (
                        <div className="flex gap-1">
                          <button onClick={() => editChecklistItem(category, item.id)} className="p-2 text-zinc-500 hover:text-white transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => removeChecklistItem(category, item.id)} className="p-2 text-red-500/50 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  {isEditingChecklist && items.length === 0 && (
                    <p className="text-[10px] text-zinc-600 italic">Nenhum item nesta categoria.</p>
                  )}
                </div>
              </section>
            ))}

            {isEditingChecklist && (
              <button 
                onClick={addChecklistCategory}
                className="w-full border-2 border-dashed border-zinc-800 p-4 rounded-[32px] text-zinc-500 text-xs font-bold uppercase tracking-widest hover:border-emerald-500/30 hover:text-emerald-500 transition-colors"
              >
                + ADICIONAR CATEGORIA
              </button>
            )}

            <section className="bg-zinc-900 rounded-[32px] p-6 border border-white/5 space-y-6">
              <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                <BookOpen size={14} /> Guias Rápidos
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'Nós de Pesca', icon: Anchor, color: 'text-blue-400' },
                  { title: 'Tabela de Marés', icon: Waves, color: 'text-emerald-400' },
                  { title: 'Fases da Lua', icon: Moon, color: 'text-purple-400' },
                  { title: 'Clima & Vento', icon: Wind, color: 'text-orange-400' },
                ].map((guide, idx) => (
                  <button 
                    key={idx}
                    onClick={() => alert(`${guide.title}: Conteúdo em desenvolvimento para a próxima atualização!`)}
                    className="bg-black/40 border border-white/5 p-4 rounded-2xl flex flex-col items-center gap-3 hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all group"
                  >
                    <guide.icon size={24} className={`${guide.color} group-hover:scale-110 transition-transform`} />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{guide.title}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="bg-zinc-900 rounded-[32px] p-6 border border-white/5 space-y-4">
              <h3 className="text-xs font-bold tracking-widest text-zinc-500 uppercase flex items-center gap-2">
                <AlertTriangle size={14} className="text-red-500" /> Segurança SOS
              </h3>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest ml-1">WhatsApp de Emergência</label>
                <div className="flex gap-2">
                  <input 
                    type="tel" 
                    placeholder="Ex: 5511999999999"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <button 
                onClick={sendEmergencyLocation}
                className="w-full bg-red-600/10 border border-red-500/20 p-4 rounded-2xl text-red-500 font-bold text-sm flex items-center justify-center gap-2 hover:bg-red-600/20 transition-colors"
              >
                ENVIAR LOCALIZAÇÃO DE EMERGÊNCIA
              </button>
              <p className="text-[8px] text-zinc-600 text-center uppercase font-bold tracking-tighter">
                Isso abrirá o WhatsApp com sua localização atual e uma mensagem de socorro.
              </p>
            </section>
          </div>
        )}

        {activeTab === 'gallery' && (
          <div className="h-full bg-zinc-950 flex flex-col">
            <header className="p-6 flex justify-between items-center border-b border-white/5">
              <button onClick={() => setActiveTab('home')} className="p-2 -ml-2"><ChevronLeft /></button>
              <h2 className="font-display font-bold text-xl">Diário de Capturas</h2>
              {recordings.length > 0 && (
                <button 
                  onClick={async () => {
                    if (confirm("Deseja limpar todo o diário? Esta ação não pode ser desfeita.")) {
                      setRecordings([]);
                      localStorage.removeItem('fishcapture_recordings');
                      await clearAllVideos();
                    }
                  }}
                  className="text-[10px] font-bold text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors"
                >
                  LIMPAR
                </button>
              )}
              <button 
                onClick={() => alert("Compartilhar: Link do Diário copiado para a área de transferência!")}
                className="p-2 active:scale-90 transition-transform"
              >
                <Share2 size={20} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {recordings.map((rec) => (
                <div key={rec.id} className="bg-zinc-900 rounded-[32px] border border-white/5 overflow-hidden">
                  <div className="aspect-video bg-black relative group">
                    <video 
                      src={rec.url} 
                      className="w-full h-full object-contain" 
                      controls
                      playsInline
                      onError={(e) => {
                        const target = e.target as HTMLVideoElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          const errorMsg = document.createElement('div');
                          errorMsg.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-zinc-800';
                          errorMsg.innerHTML = '<div class="text-zinc-500 mb-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto"><path d="m21 21-9-9m-9 9 9-9"/><path d="M16 5V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v1"/><path d="M3 5h18"/><path d="M20 5v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></div><div class="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Vídeo Expirado</div>';
                          parent.appendChild(errorMsg);
                        }
                      }}
                    />
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-lg">Captura #{rec.id}</h4>
                        <p className="text-xs text-zinc-500">{new Date(rec.timestamp).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = rec.url;
                            a.download = `captura-${rec.id}.webm`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          }}
                          className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                          title="Salvar na Galeria"
                        >
                          <Download size={16} />
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              if (navigator.share) {
                                // Try to share the file if possible, otherwise share text
                                try {
                                  const response = await fetch(rec.url);
                                  const blob = await response.blob();
                                  const file = new File([blob], `captura-${rec.id}.webm`, { type: blob.type });
                                  if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                    await navigator.share({
                                      title: `Captura #${rec.id}`,
                                      text: 'Olha essa captura no FishCapture Pro!',
                                      files: [file]
                                    });
                                    return;
                                  }
                                } catch (e) {
                                  console.log("File sharing not supported, falling back to text");
                                }
                                await navigator.share({
                                  title: `Captura #${rec.id}`,
                                  text: 'Olha essa captura no FishCapture Pro!',
                                  url: window.location.href
                                });
                              } else {
                                alert("Compartilhamento não suportado neste navegador.");
                              }
                            } catch (err) {
                              console.error("Error sharing:", err);
                            }
                          }}
                          className="p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors"
                          title="Compartilhar"
                        >
                          <Share2 size={16} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (confirm("Deseja excluir este vídeo?")) {
                              setRecordings(prev => prev.filter(r => r.id !== rec.id));
                              await deleteVideo(rec.id);
                            }
                          }}
                          className="p-2 bg-zinc-800 rounded-full text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    {rec.details?.location && (
                      <div className="flex gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        <span className="flex items-center gap-1"><MapPin size={12} /> {rec.details.location.lat.toFixed(2)}, {rec.details.location.lng.toFixed(2)}</span>
                        <span className="flex items-center gap-1"><Moon size={12} /> {rec.details.moonPhase}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => alert("Análise de IA: Esta captura mostra um exemplar saudável. Condições ideais: Maré vazante, Lua Crescente.")}
                      className="w-full bg-emerald-500/10 text-emerald-500 px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                    >
                      <BrainCircuit size={16} /> ANÁLISE IA DA CAPTURA
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <nav className="bg-zinc-950 border-t border-white/5 px-4 py-4 safe-area-bottom flex justify-between items-center z-50">
        {[
          { id: 'home', icon: LayoutDashboard, label: 'Home' },
          { id: 'camera', icon: Camera, label: 'Câmera' },
          { id: 'map', icon: MapIcon, label: 'Hotspots' },
          { id: 'gallery', icon: FolderOpen, label: 'Diário' },
          { id: 'settings', icon: Settings2, label: 'Config' },
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)} 
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === item.id ? 'text-emerald-500 scale-110' : 'text-zinc-600'}`}
          >
            <item.icon size={18} />
            <span className="text-[8px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
