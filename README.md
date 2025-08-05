# Direct Montage

A Next.js-based web application for audio file processing with WebAssembly support.

## Features

- **Audio File Upload**: Drag-and-drop or click to upload audio files
- **Waveform Visualization**: Interactive waveform display using WaveSurfer.js
- **Frequency Analysis**: Real-time frequency spectrum visualization
- **Audio Cropping**: Select and crop specific regions of audio
- **Gain Control**: Adjust audio volume with dB display
- **Export**: Download processed audio files

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **WaveSurfer.js** for waveform visualization
- **FFmpeg WASM** for audio processing
- **ESLint** for code quality

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Upload Audio**: Click or drag an audio file onto the upload area
2. **Visualize**: View the waveform and frequency analysis
3. **Edit**:
   - Click "Select Region" to mark an area for cropping
   - Adjust the gain slider to change volume
4. **Process**: Click "Crop Selection" or "Apply Gain" to process
5. **Export**: Click "Download Processed Audio" to save your file

## Project Structure

```
direct-montage/
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── AudioUpload.tsx
│   ├── WaveformVisualizer.tsx
│   ├── FrequencyAnalyzer.tsx
│   └── GainControl.tsx
├── lib/              # Utility functions
│   └── audioProcessor.ts
└── public/           # Static assets
```

## Browser Requirements

- Modern browser with WebAssembly support
- SharedArrayBuffer support (requires secure context)

## Notes

- Audio processing is performed entirely in the browser using WebAssembly
- No server-side processing or file uploads required
- All audio data remains local to the user's device
