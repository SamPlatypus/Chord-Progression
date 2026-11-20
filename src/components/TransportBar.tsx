import { togglePlay } from '../audio/playback';
import { store, useStore } from '../state/store';
import { Icon } from './Icon';

export function TransportBar() {
  const playing = useStore((s) => s.transport.playing);
  const loop = useStore((s) => s.settings.loop);
  const metronome = useStore((s) => s.settings.metronome);
  const bpm = useStore((s) => s.song.bpm);
  const sheet = useStore((s) => s.sheet);
  const hasRange = useStore((s) => !!s.song.loopRange);

  return (
    <nav className="transport" aria-label="Playback">
      <div className="transport-inner">
        <button
          className={`t-btn ${loop ? 'on' : ''}`}
          onClick={() => store.setSettings({ loop: !loop })}
          aria-pressed={loop}
          aria-label="Loop"
        >
          <Icon name="loop" />
          {hasRange && loop ? 'Section' : 'Loop'}
        </button>
        <button
          className={`t-btn ${metronome ? 'on' : ''}`}
          onClick={() => store.setSettings({ metronome: !metronome })}
          aria-pressed={metronome}
          aria-label="Metronome"
        >
          <Icon name="metronome" />
          Click
        </button>
        <button className={`play-btn ${playing ? 'playing' : ''}`} onClick={togglePlay} aria-label={playing ? 'Stop' : 'Play'}>
          <Icon name={playing ? 'stop' : 'play'} />
        </button>
        <button className={`t-btn ${sheet === 'tempo' ? 'on' : ''}`} onClick={() => store.openSheet(sheet === 'tempo' ? null : 'tempo')} aria-label={`Tempo ${bpm} BPM`}>
          <span className="big num">{bpm}</span>
          BPM
        </button>
        <button className={`t-btn ${sheet === 'sound' ? 'on' : ''}`} onClick={() => store.openSheet(sheet === 'sound' ? null : 'sound')} aria-label="Sound and style">
          <Icon name="sliders" />
          Sound
        </button>
      </div>
    </nav>
  );
}
