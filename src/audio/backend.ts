/**
 * Audio backend — the injection seam (docs/areas/06-audio.md §3.1/§4). ALL Web Audio access goes
 * through `AudioBackend`; production uses `WebAudioBackend` (the ONLY place in `src/audio/` that may
 * touch the global `AudioContext`/`webkitAudioContext`), tests use `FakeAudioBackend` (constructs no
 * real context — §8.2). The foundational audio types (`SfxId`, `AudioSettings`, the handle shapes)
 * live here so both the content table and the engine import them without an import cycle.
 *
 * Two small, additive extensions over the doc's illustrative §4 interface, both ignored by Web Audio:
 *  - `PlayOpts.out` / `ToneOpts.out`: the channel gain node the engine routes a voice through, so the
 *    engine owns the single source of truth for the mixer graph ("every source connects through its
 *    channel gain", §3.3).
 *  - `PlayOpts.tag` / `ToneOpts.tag`: a diagnostic label (the `SfxId` or a music-layer id) the fake
 *    records for test attribution; the real backend drops it.
 */

export type Channel = 'music' | 'sfx';

/** The fixed SFX id set (docs/areas/06-audio.md §4). Single source of truth, mirroring `SPRITE_IDS`. */
export const SFX_IDS = [
  'gunFire',
  'droneExplode',
  'kaching',
  'rubleTick',
  'meterWarn',
  'jackpot',
  'comboUp',
  'incidentAlarm',
  'gameOver',
  'uiSelect',
  'uiConfirm',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export interface AudioSettings {
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}

export interface GainHandle {
  gain: number;
  connect(to: GainHandle): void;
}

export interface VoiceHandle {
  stop(): void;
  readonly active: boolean;
}

/** Opaque decoded-asset handle. `WebAudioBackend` wraps a real `AudioBuffer`; the fake fabricates one. */
export interface DecodedHandle {
  readonly durationMs: number;
}

export interface PlayOpts {
  channel: Channel;
  loop?: boolean;
  gain?: number;
  rate?: number;
  /** Channel gain node to route through (engine-supplied). Falls back to `destination`. */
  out?: GainHandle;
  /** Diagnostic label (e.g. the SfxId); ignored by Web Audio, recorded by the fake for tests. */
  tag?: string;
}

export interface ToneOpts {
  channel: Channel;
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
  out?: GainHandle;
  tag?: string;
}

export interface AudioBackend {
  readonly state: 'suspended' | 'running' | 'closed';
  readonly currentTime: number;
  resume(): Promise<void>;
  createGain(): GainHandle;
  decode(bytes: ArrayBuffer): Promise<DecodedHandle>;
  playBuffer(buffer: DecodedHandle, opts: PlayOpts): VoiceHandle;
  playTone(opts: ToneOpts): VoiceHandle;
  readonly destination: GainHandle;
}

// ---- WebAudioBackend (production) -----------------------------------------------------------

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function resolveAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
}

/** A `GainHandle` wrapping a real `GainNode` (the node is the routing identity for `connect`). */
class WebGain implements GainHandle {
  constructor(readonly node: GainNode) {}
  get gain(): number {
    return this.node.gain.value;
  }
  set gain(v: number) {
    // setTargetAtTime would be smoother, but a direct set keeps live mute/volume changes simple and
    // glitch-free enough for chiptune; the music director crossfades layers separately.
    this.node.gain.value = v;
  }
  connect(to: GainHandle): void {
    if (to instanceof WebGain) this.node.connect(to.node);
  }
}

interface WebDecoded extends DecodedHandle {
  readonly buffer: AudioBuffer;
}

/**
 * Real Web Audio backend. Constructs `AudioContext ?? webkitAudioContext` (iOS Safari fallback,
 * `compatibility.md §5`). `resume()` must be called synchronously inside a user-gesture handler —
 * the engine's `unlock()` is wired to Core's `onFirstGesture`. Never throws into the game loop:
 * a missing/declined context degrades to a silent no-op backend.
 */
export function createWebAudioBackend(): AudioBackend {
  const Ctor = resolveAudioContextCtor();
  const ctx = Ctor ? new Ctor() : undefined;
  const destination: GainHandle = ctx ? new WebGain(ctx.destination as unknown as GainNode) : silentGain();

  const inactiveVoice: VoiceHandle = { stop() {}, active: false };

  return {
    get state() {
      return (ctx?.state ?? 'closed') as AudioBackend['state'];
    },
    get currentTime() {
      return ctx?.currentTime ?? 0;
    },
    destination,
    async resume() {
      try {
        await ctx?.resume();
      } catch {
        /* never throw into the loop (§3.8) */
      }
    },
    createGain() {
      if (!ctx) return silentGain();
      return new WebGain(ctx.createGain());
    },
    async decode(bytes) {
      if (!ctx) return { durationMs: 0 };
      const buffer = await ctx.decodeAudioData(bytes);
      const decoded: WebDecoded = { durationMs: buffer.duration * 1000, buffer };
      return decoded;
    },
    playBuffer(buffer, opts) {
      if (!ctx || !('buffer' in buffer)) return inactiveVoice;
      try {
        const src = ctx.createBufferSource();
        src.buffer = (buffer as WebDecoded).buffer;
        src.loop = opts.loop ?? false;
        if (opts.rate) src.playbackRate.value = opts.rate;
        const tap = ctx.createGain();
        tap.gain.value = opts.gain ?? 1;
        src.connect(tap);
        connectToOut(tap, opts.out, destination);
        src.start();
        return webVoice(src, tap);
      } catch {
        return inactiveVoice;
      }
    },
    playTone(opts) {
      if (!ctx) return inactiveVoice;
      try {
        const osc = ctx.createOscillator();
        osc.type = opts.type ?? 'square';
        osc.frequency.value = opts.freq;
        const env = ctx.createGain();
        const peak = opts.gain ?? 0.5;
        const now = ctx.currentTime;
        const dur = opts.durationMs / 1000;
        // Short attack + exponential-ish decay envelope so placeholder tones read as "blips", not drones.
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(peak, now + 0.005);
        env.gain.linearRampToValueAtTime(0.0001, now + dur);
        osc.connect(env);
        connectToOut(env, opts.out, destination);
        osc.start(now);
        osc.stop(now + dur);
        return webVoice(osc, env);
      } catch {
        return inactiveVoice;
      }
    },
  };
}

function connectToOut(node: GainNode, out: GainHandle | undefined, destination: GainHandle): void {
  if (out instanceof WebGain) node.connect(out.node);
  else if (destination instanceof WebGain) node.connect(destination.node);
}

function webVoice(source: AudioScheduledSourceNode, tap: GainNode): VoiceHandle {
  let stopped = false;
  source.addEventListener('ended', () => {
    stopped = true;
  });
  return {
    stop() {
      stopped = true;
      try {
        source.stop();
        tap.disconnect();
      } catch {
        /* already stopped */
      }
    },
    get active() {
      return !stopped;
    },
  };
}

/** A detached gain used when no real context exists (SSR / declined audio) — keeps calls safe. */
function silentGain(): GainHandle {
  return { gain: 0, connect() {} };
}

// ---- FakeAudioBackend (tests) ---------------------------------------------------------------

export interface FakePlay {
  kind: 'buffer' | 'tone';
  channel: Channel;
  tag?: string;
  gain?: number;
  loop?: boolean;
  freq?: number;
  voice: FakeVoice;
}

export interface FakeVoice extends VoiceHandle {
  /** Test control: mark the voice as finished so voice-cap pruning can reclaim its slot. */
  end(): void;
}

export interface FakeGain extends GainHandle {
  readonly connectedTo: GainHandle[];
}

export interface FakeAudioBackend extends AudioBackend {
  readonly plays: FakePlay[];
  readonly gains: FakeGain[];
  resumeCalls: number;
  /** Drive the context lifecycle in tests (unlock / visibility). */
  setState(s: AudioBackend['state']): void;
  /** Advance the synthetic clock (seconds) for rate-limit tests. */
  advance(seconds: number): void;
  /** All recorded plays carrying `tag`. */
  playsTagged(tag: string): FakePlay[];
  /** Currently-active voices for `tag` (for voice-cap assertions). */
  activeVoices(tag: string): FakeVoice[];
}

export function createFakeAudioBackend(): FakeAudioBackend {
  const plays: FakePlay[] = [];
  const gains: FakeGain[] = [];
  let state: AudioBackend['state'] = 'suspended';
  let clock = 0;
  let resumeCalls = 0;

  function makeVoice(): FakeVoice {
    let active = true;
    return {
      stop() {
        active = false;
      },
      end() {
        active = false;
      },
      get active() {
        return active;
      },
    };
  }

  function record(kind: 'buffer' | 'tone', channel: Channel, opts: PlayOpts | ToneOpts): FakeVoice {
    const voice = makeVoice();
    const play: FakePlay = { kind, channel, voice };
    if (opts.tag !== undefined) play.tag = opts.tag;
    if (opts.gain !== undefined) play.gain = opts.gain;
    if ('loop' in opts && opts.loop !== undefined) play.loop = opts.loop;
    if ('freq' in opts && opts.freq !== undefined) play.freq = opts.freq;
    plays.push(play);
    return voice;
  }

  function makeGain(): FakeGain {
    const connectedTo: GainHandle[] = [];
    const g: FakeGain = {
      gain: 1,
      connectedTo,
      connect(to) {
        connectedTo.push(to);
      },
    };
    gains.push(g);
    return g;
  }

  return {
    plays,
    gains,
    get resumeCalls() {
      return resumeCalls;
    },
    set resumeCalls(n: number) {
      resumeCalls = n;
    },
    get state() {
      return state;
    },
    get currentTime() {
      return clock;
    },
    destination: makeGain(),
    setState(s) {
      state = s;
    },
    advance(seconds) {
      clock += seconds;
    },
    async resume() {
      resumeCalls += 1;
      state = 'running';
    },
    createGain() {
      return makeGain();
    },
    async decode() {
      return { durationMs: 1000 };
    },
    playBuffer(_buffer, opts) {
      return record('buffer', opts.channel, opts);
    },
    playTone(opts) {
      return record('tone', opts.channel, opts);
    },
    playsTagged(tag) {
      return plays.filter((p) => p.tag === tag);
    },
    activeVoices(tag) {
      return plays.filter((p) => p.tag === tag && p.voice.active).map((p) => p.voice);
    },
  };
}
