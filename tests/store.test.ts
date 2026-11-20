import { beforeEach, describe, expect, it } from 'vitest';
import { PRESETS } from '../src/music/presets';
import { decodeSong, encodeSong } from '../src/state/share';
import { store } from '../src/state/store';
import { chordName, makeChord } from '../src/theory/chords';
import { capoOptions, substitutions } from '../src/theory/suggest';

const names = () => store.state.song.chords.map((c) => chordName(c, { tonic: store.state.song.tonic, mode: store.state.song.mode }));
const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('store', () => {
  beforeEach(() => {
    store.newSong(preset('axis'));
    store.setKey({ letter: 0, acc: 0 }, 'major');
  });

  it('starts from a preset in C', () => {
    expect(names()).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('inserts, undoes and redoes', () => {
    store.insertChord(makeChord(2, 'min'), 1);
    expect(names()).toEqual(['C', 'Dm', 'G', 'Am', 'F']);
    store.undo();
    expect(names()).toEqual(['C', 'G', 'Am', 'F']);
    store.redo();
    expect(names()).toEqual(['C', 'Dm', 'G', 'Am', 'F']);
  });

  it('coalesces rapid tempo edits into one undo step', () => {
    const start = store.state.song.bpm;
    store.setTempo(start + 1, true);
    store.setTempo(start + 2, true);
    store.setTempo(start + 3, true);
    store.undo();
    expect(store.state.song.bpm).toBe(start);
  });

  it('transposes with the key and adapts to a new mode', () => {
    store.setKey({ letter: 3, acc: 0 }, 'major'); // F major
    expect(names()).toEqual(['F', 'C', 'Dm', 'B♭']);
    store.setKey({ letter: 3, acc: 0 }, 'dorian');
    expect(names()).toEqual(['Fm', 'Cm', 'Ddim', 'B♭']);
  });

  it('moves chords and keeps loop ranges by id', () => {
    store.setLoopRange(1, 2);
    store.moveChord(0, 3);
    expect(names()).toEqual(['G', 'Am', 'F', 'C']);
    const { loopRange, chords } = store.state.song;
    expect(chords.findIndex((c) => c.id === loopRange!.startId)).toBe(0);
    expect(chords.findIndex((c) => c.id === loopRange!.endId)).toBe(1);
    store.removeChord(0);
    expect(store.state.song.loopRange).toBeNull();
  });

  it('changes meter keeping whole-bar chords whole bars', () => {
    store.replaceChord(1, { beats: 2 });
    store.setMeter(3);
    expect(store.state.song.chords.map((c) => c.beats)).toEqual([3, 2, 3, 3]);
  });

  it('loads presets with their mode and style', () => {
    store.setSettings({ applyPresetStyle: true });
    store.loadPreset(preset('andalusian'));
    expect(store.state.song.mode).toBe('minor');
    expect(names()).toEqual(['Cm', 'B♭', 'A♭', 'G']);
    expect(store.state.song.bpm).toBe(preset('andalusian').bpm);
  });

  it('fits chromatic chords to the scale', () => {
    store.loadPreset(preset('mixo-rock'));
    store.fitToMode();
    expect(names()).toEqual(['C', 'Bdim', 'F', 'C']);
  });

  it('manages the library', () => {
    const id = store.state.song.id;
    const count = store.state.library.length;
    store.duplicateSong(id);
    expect(store.state.library.length).toBe(count + 1);
    store.renameSong(id, '  Verse idea ');
    expect(store.state.song.name).toBe('Verse idea');
    store.deleteSong(id);
    expect(store.state.library.some((s) => s.id === id)).toBe(false);
    expect(store.state.song.id).not.toBe(id);
  });
});

describe('share links', () => {
  it('round-trips a song', () => {
    store.newSong(preset('two-five-one'));
    const song = store.state.song;
    const decoded = decodeSong(encodeSong(song))!;
    expect(decoded.name).toBe(song.name);
    expect(decoded.bpm).toBe(song.bpm);
    expect(decoded.swing).toBe(song.swing);
    expect(decoded.chords.map((c) => [c.root, c.quality, c.bass, c.beats])).toEqual(song.chords.map((c) => [c.root, c.quality, c.bass, c.beats]));
  });

  it('rejects garbage', () => {
    expect(decodeSong('not-a-song')).toBeNull();
  });
});

describe('songwriting helpers', () => {
  it('suggests substitutions', () => {
    const iv = makeChord(5, 'maj');
    const s = substitutions(iv, makeChord(7, 'maj'), 'major');
    const keys = s.map((x) => `${x.root}:${x.quality}`);
    expect(keys).toContain('2:min'); // ii shares two notes
    expect(keys).toContain('5:min'); // borrowed iv
    expect(keys).toContain('2:7'); // V7/V into G
  });

  it('finds open-shape capo positions', () => {
    // E♭ major I–V–vi–IV → capo 3 gives C–G–Am–F shapes
    const chords = [makeChord(0, 'maj'), makeChord(7, 'maj'), makeChord(9, 'min'), makeChord(5, 'maj')];
    const best = capoOptions(chords, { tonic: { letter: 2, acc: -1 }, mode: 'major' });
    expect(best[0].capo).toBe(1); // D shapes: D A Bm G → D, A, G open (3 of 4)
    expect(best.some((o) => o.capo === 3)).toBe(true);
  });
});
