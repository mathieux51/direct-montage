# Multitrack editor (Audacity spirit, simpler)

## Objective

Turn Direct Montage from a single-file crop/gain tool into a simple multitrack
editor:

- Copy, cut and paste audio regions
- Linear fade in / fade out with a typed duration
- Multiple tracks, mute per track
- Split a region and move it (in time and to another track)
- Click/tap up or down to change the volume of a region

## Progress

- [x] 2026-10-05: Read existing code (WaveSurfer + FFmpeg WASM, single file, destructive edits)
- [x] 2026-10-05: Checked the Direct Podcast integration (shared IndexedDB + `/montage?sharing=true`)
- [x] Data model and pure edit operations (`lib/audio/edit.ts`)
- [x] Editor state reducer with undo/redo (`lib/editorState.ts`)
- [x] Peaks, playback engine, mixdown/WAV export
- [x] IndexedDB project persistence (+ migration of the old single-file storage)
- [x] Timeline canvas UI (tracks, regions, selection, drag, pinch/zoom)
- [x] Toolbar (transport, edit, fades, export) and keyboard shortcuts
- [x] Shared-file flow from Direct Podcast
- [x] Unit checks of edit/mixdown logic (17 checks)
- [x] Type-check, lint, build
- [x] Browser checks: desktop Chrome and WebKit (23 checks each), phone
      viewport with touch (8), migration and share flows (6)
- [x] README update
- [x] Removed `wavesurfer.js`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`

## Decisions

- Non-destructive model: a project is a list of tracks, a track is a list of
  regions (clips) pointing into decoded source audio. Cut/copy/paste/split/move,
  volume and fades only change this small JSON, so undo/redo is cheap and exact.
- Web Audio API for decoding and playback, plain JS mixdown for export (WAV
  16-bit). WaveSurfer and FFmpeg WASM are no longer needed.
- Audio is decoded at a fixed 48 kHz (OfflineAudioContext) and exported at
  48 kHz, so quality never depends on the output device (Bluetooth headsets in
  call mode run at 16 or 24 kHz).
- Editing follows a text-editor metaphor along each track, like Audacity:
  delete/cut close the gap, paste inserts and pushes later audio right.
- Regions never overlap on a track. A moved region is inserted where it is
  dropped: a region it lands inside is split, and regions in the way slide right
  just enough to make room. No audio is lost.
- Volume and fades apply to the selection. If the selection covers only part of
  a region, that part is split off into its own region first.
- Fades are linear (amplitude) ramps stored on the region (`fadeIn`/`fadeOut`
  in seconds), set from a duration input.
- Volume: ▼/▲ buttons shown on a selected range or region (±1 dB per
  click/tap), plus the arrow keys (which also work with a bare cursor).
- Mute is not an undo step (like Audacity); undo keeps the current mute state.
- A file shared from Direct Podcast is loaded directly into an empty project;
  if a project already exists, the user chooses "add as new track" or "new
  project".

## Issues

- Overlapping regions made ▲/▼ also change the overlapped neighbour. Fixed by
  the no-overlap move rule above.
- On phones, Chrome's touch adjustment sent taps near the ▼/▲ buttons or the
  track headers to them. Fixed: the buttons only show for a selected range or
  region, sit under the region's top bar, and the canvas is marked tappable.
- "New project" from the share dialog wiped storage before decoding the new
  file and relied on the debounced autosave. Fixed: decode first, then store
  files and project immediately.
- Known limit: long recordings are fully decoded in memory (as before), which
  can be heavy on phones.

## Next Steps

- [x] 2026-10-05: Committed and pushed to `main` (no Linear ticket).
- Ideas if needed later: drag-to-adjust fades.

## Round 2: feedback (2026-10-06)

### Objective

- Lengthen (or shorten) a copied/pasted region at its start or end
- Group / ungroup regions (padlock)
- Export WAV (HD) or high-definition MP3 (two buttons)
- Rename "Ajouter une piste" to "Ajouter un fichier son"
- New "Ajouter une piste vierge" button
- VU meter with the -12 dB mark, to set volumes
- Confirmed: the red vertical lines in waveforms mark saturation

### Progress

- [x] Region edges: drag either end of a region's top bar (`trimClip`)
- [x] Groups: `groupId` on regions, padlock toggle, Ctrl+G / Ctrl+Shift+G,
      grouped regions move together (time and tracks), copies form new groups
- [x] Exports: WAV 24-bit / 48 kHz and MP3 320 kbit/s / 48 kHz
- [x] Buttons: "Ajouter un fichier son", "Ajouter une piste vierge"
- [x] VU meter (peak, -60 to 0 dB, -12 dB mark, SAT light) + -12 dB guides on
      every track
- [x] Unit checks (25), browser checks in Chrome and WebKit (new features 20,
      earlier suites 23 + 8 + 6), type-check, lint, build
- [x] README update

### Decisions

- Lengthening never covers another region: if something is in the way it
  slides right (the same rule as moving). A region cannot grow past the start
  or end of its recording.
- Resize handles are the ends of the top bar (grips drawn there), so starting a
  range selection near a region edge in the waveform still selects.
- Groups only tie movement together. Volume, fades and cuts still follow the
  selection, so one region of a group can be adjusted alone.
- WAV (HD) means 24-bit PCM; MP3 (HD) means 320 kbit/s CBR, both at 48 kHz.
- MP3 encoding uses `wasm-media-encoders` (LAME in WebAssembly, about 3x
  faster than the JavaScript port), loaded only when exporting MP3.
- The meter is a peak meter (instant rise, slow fall, 1.5 s peak hold), since
  the goal is avoiding saturation and placing peaks around -12 dB.
