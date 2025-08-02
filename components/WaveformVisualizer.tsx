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
  const regionsPluginRef = useRef<any>(null);
  const regionRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRegion, setHasRegion] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#60A5FA',
      progressColor: '#3B82F6',
      cursorColor: '#FFFFFF',
      barWidth: 1,
      barRadius: 1,
      cursorWidth: 2,
      height: 200,
      barGap: 1,
      minPxPerSec: 0.5,
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsPluginRef.current = regions;

    wavesurfer.on('ready', () => {
      setDuration(wavesurfer.getDuration());
      setIsReady(true);
      setIsLoading(false);
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
      
      const objectUrl = URL.createObjectURL(audioFile);
      wavesurferRef.current.load(objectUrl);
      
      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
  }, [audioFile]);


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
      const endPosition = regionRef.current.end / duration;
      
      wavesurferRef.current.seekTo(startPosition);
      wavesurferRef.current.play();
      
      // Stop playback when reaching the end of selection
      const stopPlayback = () => {
        if (wavesurferRef.current) {
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
    } else {
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
        if (onRegionUpdate) {
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
        <div ref={containerRef} className="border border-gray-600 rounded-lg p-4 bg-gray-900 overflow-x-auto relative ml-10">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 z-10">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400"></div>
                <span className="text-gray-300">Loading waveform...</span>
              </div>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={handlePlayFromBeginning}
                className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
              >
                Play from Start
              </button>
              
              <button
                onClick={handlePlayPause}
                className="px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm"
              >
                {isPlaying ? 'Pause' : 'Play from Cursor'}
              </button>

              <button
                onClick={handlePlaySelection}
                disabled={!hasRegion}
                className="px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600 text-sm"
              >
                Play Selection
              </button>
              
              <button
                onClick={handleToggleRegion}
                className={`px-4 py-2 text-white rounded-md transition-colors ${
                  hasRegion 
                    ? 'bg-blue-600 hover:bg-blue-700' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {hasRegion ? 'Remove Region' : 'Select Region'}
              </button>
            </div>
            
            <div className="text-sm text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex flex-col space-y-4 border-t border-gray-600 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-300">Zoom:</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleZoomToWindow}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                  >
                    Fit to Window
                  </button>
                  <button
                    onClick={handleZoomToSelection}
                    disabled={!hasRegion}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-400"
                  >
                    Fit to Selection
                  </button>
                </div>
                <span className="text-sm text-gray-300">
                  {zoom === 1 ? 'Window view' : `${zoom.toFixed(1)}x zoom`}
                </span>
              </div>
              
              <div className="text-xs text-gray-400">
                Scroll horizontally to navigate when zoomed
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-300">Gain:</span>
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
                <button
                  onClick={onGainApply}
                  disabled={isProcessing}
                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isProcessing ? 'Processing...' : 'Apply Gain'}
                </button>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={onDownload}
                  className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors text-sm"
                >
                  Download
                </button>
                <button
                  onClick={onNewFile}
                  className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
                >
                  New File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}