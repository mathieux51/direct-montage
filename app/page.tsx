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

  useEffect(() => {
    const loadFromURL = () => {
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
    };

    const loadStoredAudio = async () => {
      const db = await openDB();
      const transaction = db.transaction(['audioFiles'], 'readonly');
      const store = transaction.objectStore('audioFiles');
      const request = store.get('currentAudio');
      
      return new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            const file = new File([result.data], result.name, { type: result.type });
            setAudioFile(file);
            setProcessedFile(file);
            setFileName(result.fileName || result.name);
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    };

    loadFromURL();
    loadStoredAudio();
  }, [searchParams]);

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('DirectMontageDB', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles');
        }
      };
    });
  };


  const clearIndexedDB = async () => {
    const db = await openDB();
    const transaction = db.transaction(['audioFiles'], 'readwrite');
    const store = transaction.objectStore('audioFiles');
    const request = store.delete('currentAudio');
    
    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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

  const handleFileSelect = (file: File) => {
    setAudioFile(file);
    setProcessedFile(file);
    setFileName(file.name);
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
    const adjustedBlob = await adjustGain(audioFile, gain);
    const adjustedFile = new File([adjustedBlob], 'adjusted_audio.wav', { type: 'audio/wav' });
    setProcessedFile(adjustedFile);
    setIsProcessing(false);
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
          className="text-3xl font-bold text-white mb-8 cursor-pointer hover:text-gray-300 transition-colors"
          onClick={() => router.push('/', { scroll: false })}
        >
          Direct Montage
        </h1>
        
        {!audioFile ? (
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