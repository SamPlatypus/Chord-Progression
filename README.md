# Chord Loop

An offline, installable chord-progression player for songwriting practice. Pick a key and mode, load or build a progression, choose a strum, arpeggio or block pattern, and loop it while you write melodies, practise changes or try new harmony.

Everything runs on the device: all instruments are synthesized with the Web Audio API (no samples, no server, no network needed after the first visit).

## Features

**Harmony**
- 12 tonics × 9 modes (Major, Minor, Dorian, Mixolydian, Lydian, Phrygian, Harmonic & Melodic Minor, Locrian) with correct note spelling (F minor shows A♭, not G♯).
- Diatonic chord palette (triads or 7ths) plus borrowed/chromatic chords (iv, ♭VII, ♭VI, secondary dominants, Neapolitan…).
- 22 chord qualities, slash chords / inversions and pedal basses.
- Roman numerals with figured-bass inversions, colour-coded by function (tonic, predominant, dominant, chromatic), and a role for every chord ("Secondary dominant → vi", "Borrowed from minor").
- Changing the key transposes everything; changing the mode can re-harmonise the progression (I–V–vi–IV → i–v–VI–iv).
- "Try instead" substitutions: chords sharing two notes, 7ths/sus/add9 colours, modal interchange, secondary dominants, tritone subs, passing diminished chords.
- Guitar chord diagrams for every chord (including slash chords and 9ths), found by a fretboard search that prefers familiar open and barre shapes; the now-playing view can show the current and next shape.
- Guitar capo helper that finds positions with the most open-chord shapes.

**Progressions**
- 34 presets across Pop, Rock, Ballad, Jazz, Blues & Soul, Minor & Cinematic, Modal and Classical, each with a songwriting note and a suggested feel.
- Edit any chord: root, quality, bass note, length (1–16 beats); duplicate, delete, move, or long-press and drag to reorder.
- Type progressions as chord names (`| C G/B | Am7 F |`) or numerals (`ii7 V7 Imaj7`, `bVII`, `V7/vi`, `I/3`); copy a chord chart; share a link that imports the whole song.
- **Inspire me** generator: functional-harmony walks in Pop, Ballad, Rock, Jazz, Dark or Modal styles, with a "spice" control for borrowed chords, secondary dominants and colour tones.
- Library of progressions that autosave locally; full undo/redo.
- Export a multi-track **MIDI** file (chords, bass, drums, chord-name markers) or a rendered **WAV** for your DAW.

**Playback & practice**
- 10 strum patterns (with up/down strums and muted chucks), 10 arpeggios and 9 block-chord patterns, in 4/4 or 3/4, with adjustable swing.
- Six instruments: physically-modelled steel and nylon guitars (Karplus–Strong), piano, FM electric piano, synth pad and drawbar organ; plus bass lines (roots, pulse, root–fifth, walking, octaves) and drum grooves.
- Smooth voice leading picks inversions that move as little as possible, including across the loop point.
- Sample-accurate look-ahead scheduler; edits, tempo and pattern changes are heard immediately while playing.
- Active chord highlighted in the grid with beat-by-beat progress, a large "now / next" display, and a keyboard showing the exact voicing and scale.
- Loop the whole progression or a section; count-in; metronome; tap tempo; tempo trainer that speeds up every N loops.
- **Melody pad**: play the scale (or pentatonic, or just chord tones) over the loop; notes of the sounding chord light up as safe landing notes.
- Mixer with reverb, humanize, register control, screen wake-lock while playing, light/dark themes and keyboard shortcuts.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (theory, patterns, guitar shapes, generator, store, export)
npm run build      # production build in dist/ (includes the offline service worker)
npm run preview    # serve the production build
```

The build uses relative paths, so `dist/` can be hosted from any static host or sub-folder (GitHub Pages, Netlify, an S3 bucket…). HTTPS is required for installation and offline mode (localhost is fine for testing).

### Installing on a phone

1. Open the hosted app once while online.
2. **iPhone/iPad (Safari):** Share → *Add to Home Screen*. **Android (Chrome):** menu → *Install app*, or use the *Install app* button in Settings.
3. Launch it from the home screen — it opens full-screen and works in airplane mode. When a new version is deployed, the app shows an *Update* banner.

On iOS the app asks for media-playback audio, so it plays even with the silent switch on (iOS 17+).

### Native app stores (optional)

The app is a standard web build, so it can be wrapped with [Capacitor](https://capacitorjs.com/) for the App Store / Play Store:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Chord Loop" com.example.chordloop --web-dir dist
npm run build && npx cap add ios && npx cap add android
npx cap open ios   # or: npx cap open android
```

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / stop |
| L / M | Toggle loop / metronome |
| ← / → | Select previous / next chord (and hear it) |
| Enter | Edit selected chord |
| 1–7 | Add the diatonic chord on that scale degree |
| Delete | Remove selected chord |
| ↑ / ↓ (Shift = ×5) | Tempo up / down |
| ⌘/Ctrl Z, ⇧⌘Z | Undo / redo |

## Project structure

```
src/
  theory/      notes & spelling, scales/modes, chord qualities & analysis,
               text parsing, voicing & voice leading, substitutions/capo,
               guitar shape search, progression generator
  music/       patterns (strum/arp/block, swing, bass lines), drums, presets
  audio/       synthesized instruments, audio graph, look-ahead transport,
               playback glue (audition, wake-lock, playhead polling),
               MIDI/WAV export
  state/       store with undo/redo + localStorage library, share links
  components/  UI (now-playing, grid with drag-reorder, palette, transport,
               bottom sheets for key, tempo, sound, chord editor, presets…)
tests/         Vitest unit tests
vite.config.ts includes a small plugin that emits the precaching service worker
```
