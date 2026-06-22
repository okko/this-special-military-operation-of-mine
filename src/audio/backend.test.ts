// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createFakeAudioBackend, createWebAudioBackend } from './backend';

describe('FakeAudioBackend', () => {
  it('records tone/buffer plays with their channel, tag and gain', async () => {
    const b = createFakeAudioBackend();
    b.playTone({ channel: 'sfx', freq: 440, durationMs: 50, gain: 0.3, tag: 'gunFire' });
    const decoded = await b.decode(new ArrayBuffer(8));
    b.playBuffer(decoded, { channel: 'music', loop: true, tag: 'base' });
    expect(b.plays).toHaveLength(2);
    expect(b.plays[0]).toMatchObject({ kind: 'tone', channel: 'sfx', tag: 'gunFire', freq: 440, gain: 0.3 });
    expect(b.plays[1]).toMatchObject({ kind: 'buffer', channel: 'music', tag: 'base', loop: true });
    expect(b.playsTagged('gunFire')).toHaveLength(1);
  });

  it('tracks active voices and reclaims them on stop/end', () => {
    const b = createFakeAudioBackend();
    const v = b.playTone({ channel: 'sfx', freq: 1, durationMs: 1, tag: 'x' });
    expect(b.activeVoices('x')).toHaveLength(1);
    v.stop();
    expect(b.activeVoices('x')).toHaveLength(0);
    b.playTone({ channel: 'sfx', freq: 1, durationMs: 1, tag: 'y' });
    b.activeVoices('y')[0]?.end(); // FakeVoice exposes end() for test control
    expect(b.activeVoices('y')).toHaveLength(0);
  });

  it('resume() transitions to running and advance() moves the clock', async () => {
    const b = createFakeAudioBackend();
    expect(b.state).toBe('suspended');
    await b.resume();
    expect(b.state).toBe('running');
    expect(b.resumeCalls).toBe(1);
    b.advance(1.5);
    expect(b.currentTime).toBeCloseTo(1.5);
    b.setState('closed');
    expect(b.state).toBe('closed');
  });

  it('wires a gain graph via connect()', () => {
    const b = createFakeAudioBackend();
    const a = b.createGain();
    const c = b.createGain();
    a.connect(c);
    a.gain = 0.5;
    expect(a.gain).toBe(0.5);
    const fakeA = b.gains.find((g) => g === a);
    expect(fakeA?.connectedTo).toContain(c);
  });
});

// ---- WebAudioBackend against a stubbed Web Audio API (coverage of the real path) ------------

class FakeParam {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
}
class FakeGainNode {
  gain = new FakeParam();
  connect(): void {}
  disconnect(): void {}
}
class FakeOsc {
  type = 'sine';
  frequency = new FakeParam();
  connect(): void {}
  start(): void {}
  stop(): void {}
  addEventListener(): void {}
}
class FakeBufferSrc {
  buffer: unknown = null;
  loop = false;
  playbackRate = new FakeParam();
  connect(): void {}
  start(): void {}
  stop(): void {}
  addEventListener(): void {}
}
class FakeCtx {
  state = 'suspended';
  currentTime = 0;
  destination = new FakeGainNode();
  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createOscillator(): FakeOsc {
    return new FakeOsc();
  }
  createBufferSource(): FakeBufferSrc {
    return new FakeBufferSrc();
  }
  async decodeAudioData(): Promise<{ duration: number }> {
    return { duration: 1 };
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
}

type W = Window & { AudioContext?: unknown; webkitAudioContext?: unknown };

describe('WebAudioBackend (stubbed Web Audio)', () => {
  afterEach(() => {
    delete (window as W).AudioContext;
    delete (window as W).webkitAudioContext;
  });

  it('constructs via AudioContext and plays tones/buffers without throwing', async () => {
    (window as W).AudioContext = FakeCtx as unknown;
    const b = createWebAudioBackend();
    expect(b.state).toBe('suspended');
    await b.resume();
    expect(b.state).toBe('running');

    const master = b.createGain();
    master.gain = 0.5;
    master.connect(b.destination);
    expect(b.playTone({ channel: 'sfx', freq: 440, durationMs: 50, gain: 0.3, out: master }).active).toBe(true);

    const decoded = await b.decode(new ArrayBuffer(8));
    expect(decoded.durationMs).toBeCloseTo(1000);
    const voice = b.playBuffer(decoded, { channel: 'music', loop: true, rate: 1, out: master });
    expect(voice.active).toBe(true);
    voice.stop();
    expect(typeof b.currentTime).toBe('number');
  });

  it('falls back to webkitAudioContext when AudioContext is absent (iOS Safari)', () => {
    (window as W).webkitAudioContext = FakeCtx as unknown;
    const b = createWebAudioBackend();
    expect(b.createGain()).toBeDefined();
  });

  it('degrades to a safe silent backend when no Web Audio is available', async () => {
    const b = createWebAudioBackend(); // neither global set
    expect(b.state).toBe('closed');
    expect(b.createGain().gain).toBe(0);
    expect(b.playTone({ channel: 'sfx', freq: 1, durationMs: 1 }).active).toBe(false);
    const decoded = await b.decode(new ArrayBuffer(0));
    expect(decoded.durationMs).toBe(0);
    expect(b.playBuffer(decoded, { channel: 'sfx' }).active).toBe(false);
    await expect(b.resume()).resolves.toBeUndefined();
  });
});
