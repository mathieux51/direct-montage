'use client';

interface AudioUploadProps {
  onFileSelect: (file: File) => void;
}

export default function AudioUpload({ onFileSelect }: AudioUploadProps) {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      onFileSelect(file);
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
        accept="audio/*"
        onChange={handleFileChange}
        className="sr-only"
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
    </label>
  );
}