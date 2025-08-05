'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AudioUpload from '@/components/AudioUpload';
import WaveformVisualizer from '@/components/WaveformVisualizer';
import { cropAudio, adjustGain } from '@/lib/audioProcessor';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [processedFile, setProcessedFile] = useState<File | null>(null);
  const [gain, setGain] = useState(1);
  const [cropRegion, setCropRegion] = useState<{ start: number; end: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [audioHistory, setAudioHistory] = useState<Array<{file: File, gain: number}>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isReceivingSharedFile, setIsReceivingSharedFile] = useState(false);
  const [receivedChunks, setReceivedChunks] = useState<Map<number, ArrayBuffer>>(new Map());
  const [isWaitingForShare, setIsWaitingForShare] = useState(false);

  // Check for sharing mode immediately on mount
  useEffect(() => {
    const sharingMode = searchParams.get('sharing')
    if (sharingMode === 'true') {
      setIsWaitingForShare(true)
    }
  }, [searchParams])

  // Load stored audio only once on mount
  useEffect(() => {
    const loadStoredAudio = async () => {
      // Check if we're in sharing mode
      const sharingMode = searchParams.get('sharing')
      if (sharingMode === 'true') {
        return // Don't load from storage, wait for shared file
      }
      
      // Normal loading from local storage
      const db = await openDB();
      const transaction = db.transaction(['audioFiles', 'audioHistory'], 'readonly');
      const audioStore = transaction.objectStore('audioFiles');
      const historyStore = transaction.objectStore('audioHistory');
      
      // Load current audio
      const audioRequest = audioStore.get('currentAudio');
      
      return new Promise<void>((resolve, reject) => {
        audioRequest.onsuccess = async () => {
          const result = audioRequest.result;
          if (result) {
            const file = new File([result.data], result.name, { type: result.type });
            setAudioFile(file);
            setProcessedFile(file);
            setFileName(result.fileName || result.name);
            
            // Load history
            const historyData: Array<{file: File, gain: number}> = [];
            const historyRequest = historyStore.getAll();
            
            historyRequest.onsuccess = () => {
              const histories = historyRequest.result as Array<{
                data: ArrayBuffer;
                name: string;
                type: string;
                gain: number;
                index: number;
              }>;
              histories.sort((a, b) => a.index - b.index);
              
              histories.forEach((item) => {
                const historyFile = new File([item.data], item.name, { type: item.type });
                historyData.push({ file: historyFile, gain: item.gain });
              });
              
              if (historyData.length > 0) {
                setAudioHistory(historyData);
                setHistoryIndex(historyData.length - 1);
                const lastVersion = historyData[historyData.length - 1];
                setGain(lastVersion.gain);
              }
            };
          }
          resolve();
        };
        audioRequest.onerror = () => reject(audioRequest.error);
      });
    };

    loadStoredAudio();
  }, []); // Only load from DB on mount

  // Handle shared files from direct-podcast
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      if (event.origin !== 'https://directpodcast.fr' && event.origin !== 'http://localhost:3001') {
        return
      }

      if (event.data.type === 'SHARED_AUDIO_FILE') {
        // Handle complete file transfer
        const { filename, fileType, arrayBuffer } = event.data
        
        // Immediately update loading state
        setIsWaitingForShare(false)
        setIsReceivingSharedFile(true)
        
        try {
          const blob = new Blob([arrayBuffer], { type: fileType })
          const file = new File([blob], filename, { type: fileType })
          
          // Set file immediately - WaveformVisualizer will handle loading properly
          setAudioFile(file)
          setProcessedFile(file)
          setFileName(filename)
          setAudioHistory([{ file, gain: 1 }])
          setHistoryIndex(0)
          setGain(1)
          setIsReceivingSharedFile(false)
        } catch {
          alert('Erreur lors de la réception du fichier partagé.')
          setIsReceivingSharedFile(false)
        }
      } else if (event.data.type === 'SHARED_AUDIO_CHUNK') {
        // Handle chunked file transfer
        const { chunkIndex, totalChunks, chunk, filename, fileType } = event.data
        
        // Update loading state immediately on first chunk
        setIsWaitingForShare(false)
        setIsReceivingSharedFile(true)
        
        // Store the chunk
        setReceivedChunks(prevChunks => {
          const newChunks = new Map(prevChunks)
          newChunks.set(chunkIndex, chunk)
          
          // Check if we have all chunks
          if (newChunks.size === totalChunks) {
            // Reconstruct the file
            const orderedChunks: ArrayBuffer[] = []
            for (let i = 0; i < totalChunks; i++) {
              const chunk = newChunks.get(i)
              if (chunk) {
                orderedChunks.push(chunk)
              }
            }
            
            // Combine all chunks
            const totalLength = orderedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
            const combinedBuffer = new ArrayBuffer(totalLength)
            const combinedView = new Uint8Array(combinedBuffer)
            let offset = 0
            
            for (const chunk of orderedChunks) {
              combinedView.set(new Uint8Array(chunk), offset)
              offset += chunk.byteLength
            }
            
            // Create file from combined buffer
            try {
              const blob = new Blob([combinedBuffer], { type: fileType })
              const file = new File([blob], filename, { type: fileType })
              
              // Set file immediately - WaveformVisualizer will handle loading properly
              setAudioFile(file)
              setProcessedFile(file)
              setFileName(filename)
              setAudioHistory([{ file, gain: 1 }])
              setHistoryIndex(0)
              setGain(1)
              setIsReceivingSharedFile(false)
              
              // Clear chunks
              setReceivedChunks(new Map())
            } catch {
              alert('Erreur lors de la reconstruction du fichier partagé.')
              setIsReceivingSharedFile(false)
              setReceivedChunks(new Map())
            }
          }
          
          return newChunks
        })
      }
    }

    window.addEventListener('message', handleMessage)
    
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Handle URL parameters separately
  useEffect(() => {
    const gainParam = searchParams.get('gain');
    const regionStart = searchParams.get('regionStart');
    const regionEnd = searchParams.get('regionEnd');
    
    if (gainParam) {
      setGain(parseFloat(gainParam));
    }
    
    if (regionStart && regionEnd) {
      setCropRegion({
        start: parseFloat(regionStart),
        end: parseFloat(regionEnd)
      });
    }
  }, [searchParams]);

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DirectMontageDB', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles');
        }
        if (!db.objectStoreNames.contains('audioHistory')) {
          db.createObjectStore('audioHistory');
        }
      };
    });
  };


  const clearIndexedDB = async () => {
    const db = await openDB();
    const transaction = db.transaction(['audioFiles', 'audioHistory'], 'readwrite');
    const audioStore = transaction.objectStore('audioFiles');
    const historyStore = transaction.objectStore('audioHistory');
    
    audioStore.clear();
    historyStore.clear();
    
    return new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  };

  const saveToHistory = async (file: File, currentGain: number) => {
    const newHistory = [...audioHistory.slice(0, historyIndex + 1), { file, gain: currentGain }];
    
    // Keep only the last 5 versions
    if (newHistory.length > 5) {
      newHistory.shift();
    }
    
    setAudioHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    // First, read all files into memory including current file
    const fileDataPromises = newHistory.map((item, index) => {
      return new Promise<{ data: ArrayBuffer; name: string; type: string; gain: number; index: number }>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            data: reader.result as ArrayBuffer,
            name: item.file.name,
            type: item.file.type,
            gain: item.gain,
            index: index
          });
        };
        reader.readAsArrayBuffer(item.file);
      });
    });
    
    // Also read current file
    const currentFilePromise = new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(file);
    });
    
    // Wait for all files to be read
    const [fileData, currentFileData] = await Promise.all([
      Promise.all(fileDataPromises),
      currentFilePromise
    ]);
    
    // Now save to IndexedDB in a single transaction
    const db = await openDB();
    const transaction = db.transaction(['audioHistory', 'audioFiles'], 'readwrite');
    const historyStore = transaction.objectStore('audioHistory');
    const audioStore = transaction.objectStore('audioFiles');
    
    // Clear existing history
    historyStore.clear();
    
    // Save all history items
    fileData.forEach((item) => {
      historyStore.put(item, `history_${item.index}`);
    });
    
    // Save current audio file
    audioStore.put({
      data: currentFileData,
      name: file.name,
      type: file.type,
      fileName: fileName
    }, 'currentAudio');
  };

  const handleUndo = async () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousVersion = audioHistory[newIndex];
      
      setHistoryIndex(newIndex);
      setAudioFile(previousVersion.file);
      setProcessedFile(previousVersion.file);
      setGain(previousVersion.gain);
      updateURL({ gain: previousVersion.gain });
    }
  };

  const updateURL = (updates: { gain?: number; regionStart?: number; regionEnd?: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (updates.gain !== undefined) {
      params.set('gain', updates.gain.toString());
    }
    
    if (updates.regionStart !== undefined && updates.regionEnd !== undefined) {
      params.set('regionStart', updates.regionStart.toString());
      params.set('regionEnd', updates.regionEnd.toString());
    }
    
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleFileSelect = async (file: File) => {
    setAudioFile(file);
    setProcessedFile(file);
    setFileName(file.name);
    
    // Initialize history with the original file (no DB save needed here)
    setAudioHistory([{ file, gain: 1 }]);
    setHistoryIndex(0);
    setGain(1);
  };

  const handleRegionUpdate = (start: number, end: number) => {
    setCropRegion({ start, end });
    updateURL({ regionStart: start, regionEnd: end });
  };

  const handleCrop = async () => {
    if (!audioFile || !cropRegion) return;

    setIsProcessing(true);
    const croppedBlob = await cropAudio(audioFile, cropRegion.start, cropRegion.end);
    const croppedFile = new File([croppedBlob], 'cropped_audio.wav', { type: 'audio/wav' });
    
    // Save to history before updating
    await saveToHistory(croppedFile, gain);
    
    setProcessedFile(croppedFile);
    setAudioFile(croppedFile);
    setIsProcessing(false);
    // Reset the region selection after processing is complete
    setCropRegion(null);
    // Clear region from URL parameters
    const params = new URLSearchParams(searchParams.toString());
    params.delete('regionStart');
    params.delete('regionEnd');
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const handleGainApply = async () => {
    if (!audioFile) return;

    setIsProcessing(true);
    const adjustedBlob = await adjustGain(audioFile, gain, cropRegion || undefined);
    const adjustedFile = new File([adjustedBlob], 'adjusted_audio.wav', { type: 'audio/wav' });
    
    // Save to history
    await saveToHistory(adjustedFile, gain);
    
    setProcessedFile(adjustedFile);
    setAudioFile(adjustedFile);
    setIsProcessing(false);
    
    // Clear region after applying gain to region
    if (cropRegion) {
      setCropRegion(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('regionStart');
      params.delete('regionEnd');
      router.push(`?${params.toString()}`, { scroll: false });
    }
  };

  const handleDownload = () => {
    if (!processedFile) return;

    const url = URL.createObjectURL(processedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || processedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  return (
    <div className="min-h-screen py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 
          className="text-3xl font-normal text-white mb-8 cursor-pointer hover:text-gray-300 transition-colors uppercase"
          onClick={() => router.push('/', { scroll: false })}
        >
          Direct Montage
        </h1>
        
        {isWaitingForShare ? (
          <div className="bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="animate-pulse">
              <div className="text-xl font-semibold text-white mb-4">
                En attente du fichier depuis Direct Podcast...
              </div>
              <div className="text-gray-300">
                Connexion en cours...
              </div>
            </div>
          </div>
        ) : isReceivingSharedFile ? (
          <div className="bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="animate-pulse">
              <div className="text-xl font-semibold text-white mb-4">
                Réception du fichier depuis Direct Podcast...
              </div>
              <div className="text-gray-300">
                {receivedChunks.size > 0 && (
                  <div>Chunks reçus: {receivedChunks.size}</div>
                )}
              </div>
            </div>
          </div>
        ) : !audioFile ? (
          <AudioUpload onFileSelect={handleFileSelect} />
        ) : (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="text-xl font-semibold bg-transparent text-white border-none outline-none focus:bg-gray-700 focus:px-2 focus:py-1 focus:rounded transition-all duration-200 flex-1"
                  placeholder="Entrez le nom du fichier..."
                />
              </div>
              <WaveformVisualizer
                audioFile={processedFile}
                cropRegion={cropRegion}
                onRegionUpdate={handleRegionUpdate}
                gain={gain}
                onGainChange={(newGain) => {
                  setGain(newGain);
                  updateURL({ gain: newGain });
                }}
                onGainApply={handleGainApply}
                isProcessing={isProcessing}
                onDownload={handleDownload}
                onNewFile={() => {
                  setAudioFile(null);
                  setProcessedFile(null);
                  setCropRegion(null);
                  setGain(1);
                  setFileName('');
                  setAudioHistory([]);
                  setHistoryIndex(-1);
                  clearIndexedDB();
                  router.push('/', { scroll: false });
                }}
              />
              
              <div className="mt-4 flex items-center space-x-4">
                <button
                  onClick={handleCrop}
                  disabled={isProcessing || !cropRegion}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Traitement...' : 'Découper la sélection'}
                </button>
                <button
                  onClick={handleUndo}
                  disabled={isProcessing || historyIndex <= 0}
                  className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Annuler ({historyIndex}/{audioHistory.length - 1})
                </button>
                {cropRegion && (
                  <span className="text-sm text-gray-300">
                    Sélectionné : {cropRegion.start.toFixed(2)}s - {cropRegion.end.toFixed(2)}s
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen py-8"><div className="max-w-6xl mx-auto px-4"><div className="animate-pulse text-white">Chargement...</div></div></div>}>
      <HomeContent />
    </Suspense>
  );
}