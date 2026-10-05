# Direct Montage

A simple multitrack audio editor in the browser, in the spirit of Audacity.

## Features

- **Multitrack**: one track per imported file, add more at any time
- **Regions**: copy, cut, paste and delete parts of the audio (later audio
  moves to close or open the gap, like text)
- **Split and move**: split a region at the cursor or at the selection edges,
  then drag it by its top bar, in time or to another track
- **Volume**: ▼/▲ buttons on the selection change the volume of a region by
  1 dB per click/tap (arrow keys too)
- **Fades**: linear fade in / fade out with a duration typed in seconds
- **Mute** per track
- **Undo/redo** for every edit
- **Export** of the mix as a 16-bit, 48 kHz WAV file
- **Autosave** of the project in the browser (IndexedDB)
- **Direct Podcast**: recordings shared from Direct Podcast open here

## Tech Stack

- **Next.js 15** with App Router
- **TypeScript**
- **Tailwind CSS**
- **Web Audio API** for decoding and playback, canvas for the waveforms
- **ESLint** + Prettier

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

1. **Import**: click or drop one or more audio files. Each file becomes a track.
   "Ajouter une piste" adds more.
2. **Select**: drag on a track to select a range (drag across tracks, or on the
   ruler, to select several). Tap to place the cursor. Tap a region's top bar
   or double tap a region to select all of it.
3. **Edit**: Couper / Copier / Coller / Supprimer, Scinder to split.
4. **Move**: drag a region by its top bar. Dropped onto another region, it is
   inserted there and what is in the way slides right.
5. **Volume and fades**: use ▼/▲ on the selection, or type a fade length and
   press Entrée (fade in) or Sortie (fade out).
6. **Export**: "Exporter WAV" downloads the mix of the unmuted tracks.

Keyboard: Space play/pause, Ctrl/⌘+X/C/V cut/copy/paste, Delete delete,
S split, ↑/↓ volume, Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z redo, +/- zoom.
On touch screens, pinch with two fingers to zoom and slide to scroll.

## Project Structure

```
direct-montage/
├── app/                  # Next.js app router pages
├── components/
│   ├── Editor.tsx        # State, playback, persistence, shortcuts
│   ├── Timeline.tsx      # Canvas timeline: tracks, regions, gestures
│   ├── Toolbar.tsx
│   └── AudioUpload.tsx
├── lib/
│   ├── audio/
│   │   ├── edit.ts       # Pure edit operations (split, cut, paste, move...)
│   │   ├── engine.ts     # Web Audio playback
│   │   ├── mixdown.ts    # Export mix to WAV
│   │   ├── peaks.ts      # Waveform summaries
│   │   └── types.ts
│   ├── editorState.ts    # Reducer with undo/redo
│   ├── projectDB.ts      # IndexedDB project storage
│   └── sharedDB.ts       # Files shared by Direct Podcast
└── public/               # Static assets
```

## Notes

- Editing is non-destructive: regions point into the original audio, which is
  only mixed down on export.
- All processing happens in the browser; audio never leaves the device.
- Long recordings are fully decoded in memory, so very long files can be heavy
  on phones.
