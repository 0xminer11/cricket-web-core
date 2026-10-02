import type { DeliveryResultDto } from '@the-cricketer/shared-types';

/**
 * Sound for a batted ball. **Sound follows the engine's result**: which cue plays is a pure function of the
 * contact quality, the outcome and the wicket the server reported, never of anything detected in the scene (no
 * collision, no audio analysis). Every sound is a TEMPORARY PLACEHOLDER synthesised with the Web Audio API; there
 * are no audio files yet. Off by default (browsers also require a gesture before sound), and nothing is stored.
 */
export type SoundCue =
  | 'bat_clean'
  | 'bat_solid'
  | 'bat_dull'
  | 'bat_edge'
  | 'whoosh'
  | 'stumps'
  | 'crowd_boundary'
  | 'crowd_six'
  | 'crowd_wicket';

export interface ScheduledCue {
  readonly cue: SoundCue;
  /** `contact` plays when the bat meets (or misses) the ball; `result` when the result is shown. */
  readonly at: 'contact' | 'result';
}

export function cuesForResult(
  result: Pick<DeliveryResultDto, 'shot' | 'outcome'>,
): readonly ScheduledCue[] {
  const { shot, outcome } = result;
  const cues: ScheduledCue[] = [];
  const wide = outcome.extraType === 'wide';
  if (wide) return cues;
  const bowled =
    outcome.wicketType === 'bowled' || outcome.wicketType === 'lbw';
  switch (shot.contactQuality) {
    case 'perfect':
      cues.push({ cue: 'bat_clean', at: 'contact' });
      break;
    case 'good':
    case 'okay':
      cues.push({ cue: 'bat_solid', at: 'contact' });
      break;
    case 'poor':
      cues.push({ cue: 'bat_dull', at: 'contact' });
      break;
    case 'edge':
      cues.push({ cue: 'bat_edge', at: 'contact' });
      break;
    case 'miss':
      cues.push({ cue: 'whoosh', at: 'contact' });
      break;
  }
  if (bowled) cues.push({ cue: 'stumps', at: 'contact' });
  if (outcome.wicketType) cues.push({ cue: 'crowd_wicket', at: 'result' });
  else if (outcome.runsOffBat >= 6)
    cues.push({ cue: 'crowd_six', at: 'result' });
  else if (outcome.runsOffBat >= 4)
    cues.push({ cue: 'crowd_boundary', at: 'result' });
  return cues;
}

/** Cues in the browser: a few synthesised noise bursts and tones. Safe to call anywhere; does nothing when off. */
export class MatchSound {
  private context: AudioContext | null = null;
  private on = false;

  get enabled(): boolean {
    return this.on;
  }
  /** Must be called from a user gesture the first time (a button press). */
  setEnabled(on: boolean): void {
    this.on = on;
    if (!on) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      this.on = false;
    }
  }

  play(cue: SoundCue): void {
    const ctx = this.context;
    if (!this.on || !ctx) return;
    const now = ctx.currentTime;
    const burst = (
      length: number,
      gain: number,
      frequency: number,
      q: number,
      type: BiquadFilterType = 'bandpass',
    ) => {
      const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * length),
        ctx.sampleRate,
      );
      const data = buffer.getChannelData(0);
      // a fixed-seed noise source: the sound of a given cue is always the same
      let state = 0x9e3779b9;
      for (let i = 0; i < data.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        data[i] =
          (((state >>> 0) / 0xffffffff) * 2 - 1) * (1 - i / data.length) ** 2;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const volume = ctx.createGain();
      volume.gain.value = gain;
      source.connect(filter).connect(volume).connect(ctx.destination);
      source.start(now);
    };
    switch (cue) {
      case 'bat_clean':
        burst(0.12, 0.9, 1900, 4);
        burst(0.2, 0.5, 220, 1, 'lowpass');
        break;
      case 'bat_solid':
        burst(0.1, 0.6, 1300, 3);
        break;
      case 'bat_dull':
        burst(0.1, 0.4, 600, 2);
        break;
      case 'bat_edge':
        burst(0.06, 0.35, 3200, 6);
        break;
      case 'whoosh':
        burst(0.25, 0.25, 900, 0.7, 'highpass');
        break;
      case 'stumps':
        burst(0.18, 0.6, 2600, 5);
        break;
      case 'crowd_boundary':
        burst(0.9, 0.18, 700, 0.5);
        break;
      case 'crowd_six':
        burst(1.4, 0.25, 800, 0.5);
        break;
      case 'crowd_wicket':
        burst(1.1, 0.22, 500, 0.4);
        break;
    }
  }
}
