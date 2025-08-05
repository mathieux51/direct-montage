'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';

interface WaveformVisualizerProps {
  audioFile: File | null;
  cropRegion?: { start: number; end: number } | null;
  onRegionUpdate?: (start: number, end: number) => void;
  gain: number;
  onGainChange: (gain: number) => void;
  onGainApply: () => void;
  isProcessing: boolean;
  onDownload: () => void;
  onNewFile: () => void;
}

export default function WaveformVisualizer({ audioFile, cropRegion, onRegionUpdate, gain, onGainChange, onGainApply, isProcessing, onDownload, onNewFile }: WaveformVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<RegionsPlugin | null>(null);
  const regionRef = useRef<ReturnType<RegionsPlugin['addRegion']> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRegion, setHasRegion] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [firstTapTime, setFirstTapTime] = useState<number | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Detect mobile device and browser
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
    const isFirefoxMobile = isFirefox && isMobile;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#60A5FA',
      progressColor: '#3B82F6',
      cursorColor: '#FFFFFF',
      barWidth: isMobile ? 3 : 1,
      barRadius: 1,
      cursorWidth: 2,
      height: isMobile ? 150 : 200,
      barGap: isMobile ? 2 : 1,
      minPxPerSec: isFirefoxMobile ? 0.1 : 0.5, // Much lower resolution for Firefox mobile
      backend: isFirefox ? 'MediaElement' : 'WebAudio',
      interact: !isFirefoxMobile, // Disable interactions on Firefox mobile
      normalize: !isFirefoxMobile, // Disable normalization on Firefox mobile
      mediaControls: false
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      setIsReady(true);
      setIsLoading(false);
      setLoadError(false);
      setErrorMessage('');
    });

    wavesurfer.on('error', (error: Error) => {
      setIsLoading(false);
      setLoadError(true);
      setIsReady(false);
      setErrorMessage(error.message || 'Erreur lors du chargement de la forme d\'onde');
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => setIsPlaying(true));
    wavesurfer.on('pause', () => setIsPlaying(false));

    wavesurferRef.current = wavesurfer;

    return () => {
      setIsReady(false);
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
      regionsPluginRef.current = null;
      regionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioFile && wavesurferRef.current) {
      setIsReady(false);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);
      setLoadError(false);
      setErrorMessage('');
      
      const objectUrl = URL.createObjectURL(audioFile);
      
      // Add timeout for loading (shorter for Firefox, even shorter for Firefox mobile)
      const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isFirefoxMobile = isFirefox && isMobile;
      
      let timeoutDuration = 30000; // Default 30s
      if (isFirefoxMobile) {
        timeoutDuration = 8000; // 8s for Firefox mobile
      } else if (isFirefox) {
        timeoutDuration = 15000; // 15s for Firefox desktop
      }
      
      const loadTimeout = setTimeout(() => {
        if (isLoading) {
          setIsLoading(false);
          setLoadError(true);
          if (isFirefoxMobile) {
            setErrorMessage('Firefox mobile a des limitations avec les gros fichiers audio. Essayez avec un fichier plus petit ou utilisez Chrome mobile.');
          } else {
            setErrorMessage('Le chargement a pris trop de temps. Le fichier audio est peut-être trop volumineux.');
          }
        }
      }, timeoutDuration);
      
      try {
        wavesurferRef.current.load(objectUrl);
      } catch (error) {
        setIsLoading(false);
        setLoadError(true);
        setErrorMessage(error instanceof Error ? error.message : 'Erreur lors du chargement du fichier audio');
      }
      
      return () => {
        clearTimeout(loadTimeout);
        URL.revokeObjectURL(objectUrl);
      };
    }
  }, [audioFile, isLoading]);


  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      // WaveSurfer zoom expects pixels per second, not a multiplier
      const pixelsPerSecond = zoom * 0.5; // Base 0.5 pixels per second
      wavesurferRef.current.zoom(pixelsPerSecond);
    }
  }, [zoom, isReady]);

  // Sync internal region state when parent component resets cropRegion
  useEffect(() => {
    if (!cropRegion && regionRef.current) {
      // Parent has reset cropRegion to null, clear our visual region
      regionRef.current.remove();
      regionRef.current = null;
      setHasRegion(false);
    }
  }, [cropRegion]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handlePlayFromBeginning = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.seekTo(0);
      wavesurferRef.current.play();
    }
  };

  const handlePlaySelection = () => {
    if (wavesurferRef.current && regionRef.current) {
      const duration = wavesurferRef.current.getDuration();
      const startPosition = regionRef.current.start / duration;
      
      wavesurferRef.current.seekTo(startPosition);
      wavesurferRef.current.play();
      
      // Stop playback when reaching the end of selection
      const stopPlayback = () => {
        if (wavesurferRef.current && regionRef.current) {
          const currentTime = wavesurferRef.current.getCurrentTime();
          if (currentTime >= regionRef.current.end) {
            wavesurferRef.current.pause();
            wavesurferRef.current.un('audioprocess', stopPlayback);
          }
        }
      };
      
      wavesurferRef.current.on('audioprocess', stopPlayback);
    }
  };

  const handleToggleRegion = () => {
    if (!wavesurferRef.current || !isReady || !regionsPluginRef.current) return;

    if (regionRef.current) {
      // Remove existing region
      regionRef.current.remove();
      regionRef.current = null;
      setHasRegion(false);
      // Clear the region state in parent component
      if (onRegionUpdate) {
        onRegionUpdate(0, 0);
      }
    }
    
    // Also cancel any ongoing mobile selection
    if (isSelectingRegion) {
      setFirstTapTime(null);
      setIsSelectingRegion(false);
    }
    
    if (!regionRef.current) {
      // Add new region
      const duration = wavesurferRef.current.getDuration();
      const start = duration * 0.25;
      const end = duration * 0.75;

      regionRef.current = regionsPluginRef.current.addRegion({
        start,
        end,
        color: 'rgba(59, 130, 246, 0.3)',
        drag: true,
        resize: true,
      });

      setHasRegion(true);

      regionRef.current.on('update', () => {
        if (onRegionUpdate && regionRef.current) {
          onRegionUpdate(regionRef.current.start, regionRef.current.end);
        }
      });

      if (onRegionUpdate) {
        onRegionUpdate(start, end);
      }
    }
  };

  const handleZoomToWindow = () => {
    setZoom(1);
  };

  const handleZoomToSelection = () => {
    if (!wavesurferRef.current || !regionRef.current || !containerRef.current) return;
    
    const regionDuration = regionRef.current.end - regionRef.current.start;
    const containerWidth = containerRef.current.offsetWidth - 40; // Account for padding and margins
    
    if (regionDuration > 0 && containerWidth > 0) {
      // Calculate pixels per second needed to fit selection in container
      const pixelsPerSecond = containerWidth / regionDuration;
      // Convert back to our zoom multiplier (base 0.5 pixels per second)
      const zoomLevel = pixelsPerSecond / 0.5;
      const clampedZoom = Math.min(Math.max(zoomLevel, 2), 500); // Minimum zoom of 2x for selection
      
      setZoom(clampedZoom);
      
      // Center the view on the selected region after zoom is applied
      setTimeout(() => {
        if (wavesurferRef.current && regionRef.current) {
          const regionCenter = (regionRef.current.start + regionRef.current.end) / 2;
          const totalDuration = wavesurferRef.current.getDuration();
          const scrollPosition = (regionCenter / totalDuration) - 0.5; // Center the region
          wavesurferRef.current.seekTo(Math.max(0, Math.min(1, scrollPosition + 0.5)));
        }
      }, 100);
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Touch event handlers for mobile region selection (two-tap approach)
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent any default touch behavior
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!wavesurferRef.current || !isReady || !containerRef.current) return;
    
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const timeAtPosition = (x / rect.width) * duration;
    
    if (firstTapTime === null) {
      // First tap - set start point
      setFirstTapTime(timeAtPosition);
      setIsSelectingRegion(true);
      
      // Seek to this position for feedback
      wavesurferRef.current.seekTo(timeAtPosition / duration);
      
      // Remove any existing region
      if (regionRef.current) {
        regionRef.current.remove();
        regionRef.current = null;
        setHasRegion(false);
      }
    } else {
      // Second tap - create region from first tap to second tap
      const startTime = Math.min(firstTapTime, timeAtPosition);
      const endTime = Math.max(firstTapTime, timeAtPosition);
      
      if (Math.abs(endTime - startTime) > 0.1) { // Minimum 0.1 second region
        if (regionsPluginRef.current) {
          // Remove existing region if any
          if (regionRef.current) {
            regionRef.current.remove();
          }
          
          // Create new region
          regionRef.current = regionsPluginRef.current.addRegion({
            start: startTime,
            end: endTime,
            color: 'rgba(59, 130, 246, 0.3)',
            drag: false,
            resize: false,
          });
          
          setHasRegion(true);
          if (onRegionUpdate) {
            onRegionUpdate(startTime, endTime);
          }
        }
      }
      
      // Reset for next selection
      setFirstTapTime(null);
      setIsSelectingRegion(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Y-axis (dB) */}
        <div className="absolute left-0 top-0 bottom-0 w-10 flex flex-col justify-between text-xs text-gray-400 py-4">
          <span>+6dB</span>
          <span>+3dB</span>
          <span>0dB</span>
          <span>-3dB</span>
          <span>-6dB</span>
        </div>
        
        {/* Waveform container */}
        <div 
          ref={containerRef} 
          className="border border-gray-600 rounded-lg p-4 bg-gray-900 overflow-x-auto relative ml-10 touch-manipulation"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 z-10">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400"></div>
                <span className="text-gray-300">Chargement de la forme d&apos;onde...</span>
              </div>
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 z-10 p-4">
              <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-300 mb-2 font-medium">Erreur de chargement</p>
              <p className="text-sm text-gray-400 text-center max-w-md">{errorMessage}</p>
            </div>
          )}
        </div>
        
        {/* X-axis (time) */}
        {audioFile && isReady && (
          <div className="ml-10 mt-1 relative">
            <div className="flex justify-between text-xs text-gray-400">
              <span>0:00</span>
              <span>{formatTime(duration / 4)}</span>
              <span>{formatTime(duration / 2)}</span>
              <span>{formatTime(3 * duration / 4)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}
      </div>
      
      {audioFile && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <button
                  onClick={handlePlayFromBeginning}
                  className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
                >
                  Lire depuis le début
                </button>
              
                <button
                  onClick={handlePlayPause}
                  className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm"
                >
                  {isPlaying ? 'Pause' : 'Lire depuis le curseur'}
                </button>

                <button
                  onClick={handlePlaySelection}
                  disabled={!hasRegion}
                  className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600 text-sm"
                >
                  Lire la sélection
                </button>
                
                <button
                  onClick={handleToggleRegion}
                  className={`px-4 py-2 text-white rounded-md transition-colors ${
                    hasRegion 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {hasRegion ? 'Supprimer la région' : 'Sélectionner une région'}
                </button>
              </div>
              
              {/* Mobile instruction */}
              <div className="md:hidden text-xs mt-2">
                {isSelectingRegion ? (
                  <span className="text-blue-400">
                    🎯 Touchez le point de fin de votre sélection
                  </span>
                ) : (
                  <span className="text-gray-400">
                    💡 Sur mobile : premier tap = début, deuxième tap = fin de la région
                  </span>
                )}
              </div>
            
            <div className="text-sm text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

            <div className="border-t border-gray-600 pt-4 space-y-4">
              {/* Zoom controls */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                  <span className="text-sm font-medium text-gray-300">Zoom :</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleZoomToWindow}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                    >
                      Ajuster à la fenêtre
                    </button>
                    <button
                      onClick={handleZoomToSelection}
                      disabled={!hasRegion}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-400"
                    >
                      Ajuster à la sélection
                    </button>
                  </div>
                  <span className="text-sm text-gray-300">
                    {zoom === 1 ? 'Vue fenêtre' : `Zoom ${zoom.toFixed(1)}x`}
                  </span>
                </div>
                
                <div className="text-xs text-gray-400 hidden md:block">
                  Faites défiler horizontalement pour naviguer en mode zoom
                </div>
              </div>

              {/* Gain controls */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                    <span className="text-sm font-medium text-gray-300">
                      Gain{hasRegion ? ' (sélection)' : ' (global)'} :
                    </span>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="0.01"
                        value={gain}
                        onChange={(e) => onGainChange(parseFloat(e.target.value))}
                        onDoubleClick={() => onGainChange(1)}
                        className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-sm font-mono text-gray-300 min-w-[3rem]">
                        {(20 * Math.log10(gain)).toFixed(1)} dB
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={onGainApply}
                    disabled={isProcessing}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm w-full md:w-auto"
                  >
                    {isProcessing ? 'Traitement...' : hasRegion ? 'Appliquer le gain à la sélection' : 'Appliquer le gain global'}
                  </button>
                </div>
                
                <div className="flex gap-2 md:gap-3">
                  <button
                    onClick={onDownload}
                    className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm flex-1 md:flex-none"
                  >
                    Télécharger
                  </button>
                  <button
                    onClick={onNewFile}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm flex-1 md:flex-none"
                  >
                    Nouveau fichier
                  </button>
                </div>
              </div>
            </div>
        </div>
      )}
    </div>
  );
}