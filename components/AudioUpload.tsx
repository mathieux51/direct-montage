'use client';

import { useState } from 'react';

interface AudioUploadProps {
  onFileSelect: (file: File) => void;
}

export default function AudioUpload({ onFileSelect }: AudioUploadProps) {
  const [error, setError] = useState<string | null>(null);

  const validateAudioFile = (file: File): boolean => {
    // Check MIME type
    if (file.type.startsWith('audio/')) {
      return true;
    }
    
    // Check file extension as fallback
    const audioExtensions = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.aiff', '.opus', '.webm'];
    const fileName = file.name.toLowerCase();
    return audioExtensions.some(ext => fileName.endsWith(ext));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (validateAudioFile(file)) {
        setError(null);
        onFileSelect(file);
      } else {
        setError(`Format non supporté: ${file.name}. Veuillez sélectionner un fichier audio.`);
        event.target.value = ''; // Reset input
      }
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      if (validateAudioFile(file)) {
        setError(null);
        onFileSelect(file);
      } else {
        setError(`Format non supporté: ${file.name}. Veuillez sélectionner un fichier audio.`);
      }
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  };

  return (
    <label
      className="block relative border-2 border-dashed border-gray-500 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors bg-gray-800"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="Sélectionner un fichier audio"
      />
      <svg
        className="mx-auto h-12 w-12 text-gray-300 pointer-events-none"
        stroke="currentColor"
        fill="none"
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <path
          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-2 text-sm text-gray-300 pointer-events-none">
        Cliquez pour charger ou glissez-déposez
      </p>
      <p className="text-xs text-gray-400 pointer-events-none">Fichiers audio uniquement</p>
      {error && (
        <p className="mt-2 text-sm text-red-400 pointer-events-none">{error}</p>
      )}
    </label>
  );
}