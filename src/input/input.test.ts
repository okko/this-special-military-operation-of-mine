// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInput, type InputEvent, type Input } from './input';

// A stub scaler: identity mapping (jsdom getBoundingClientRect is all-zero), so world === client.
const scaler = { screenToWorld: (sx: number, sy: number) => ({ x: sx, y: sy }) };

function pointer(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, ...init });
}

describe('createInput — touch-to-aim / hold-to-fire', () => {
  let canvas: HTMLCanvasElement;
  let events: InputEvent[];
  let input: Input;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    events = [];
    input = createInput(canvas, scaler, { onEvent: (e) => events.push(e) });
  });

  afterEach(() => {
    // Dispose so the window keydown/keyup listeners don't leak across tests.
    input.dispose();
  });

  it('a primary pointerdown aims at the world point and starts firing', () => {
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 100, clientY: 50 }));
    expect(events).toEqual([
      { type: 'aim', world: { x: 100, y: 50 } },
      { type: 'fireDown' },
    ]);
  });

  it('pointermove of the primary re-aims', () => {
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 100, clientY: 50 }));
    canvas.dispatchEvent(pointer('pointermove', { pointerId: 1, clientX: 120, clientY: 60 }));
    expect(events.at(-1)).toEqual({ type: 'aim', world: { x: 120, y: 60 } });
  });

  it('pointerup stops firing', () => {
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 1, clientY: 1 }));
    canvas.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    expect(events.at(-1)).toEqual({ type: 'fireUp' });
  });

  it('pointercancel stops firing (no stuck gun on iOS interruption)', () => {
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 1, clientY: 1 }));
    canvas.dispatchEvent(pointer('pointercancel', { pointerId: 1 }));
    expect(events.at(-1)).toEqual({ type: 'fireUp' });
  });

  it('a secondary pointer does not hijack aim/fire', () => {
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 10, clientY: 10 }));
    events.length = 0;
    // secondary (non-primary) down → ignored
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: false, pointerId: 2, clientX: 99, clientY: 99 }));
    // a second "primary" while one is active → ignored
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 3, clientX: 88, clientY: 88 }));
    // a move/up on the secondary → ignored (does not cease fire)
    canvas.dispatchEvent(pointer('pointermove', { pointerId: 2, clientX: 5, clientY: 5 }));
    canvas.dispatchEvent(pointer('pointerup', { pointerId: 2 }));
    expect(events).toEqual([]);
    // the original primary still controls fire
    canvas.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    expect(events).toEqual([{ type: 'fireUp' }]);
  });

  it('tracks held keyboard state and emits key events', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(input.isDown('Space')).toBe(true);
    expect(events.at(-1)).toEqual({ type: 'key', code: 'Space', down: true });
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    expect(input.isDown('Space')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'key', code: 'Space', down: false });
  });

  it('fires the audio-unlock hook exactly once on the first gesture', () => {
    const onFirstGesture = vi.fn();
    const c = document.createElement('canvas');
    const extra = createInput(c, scaler, { onEvent: () => {}, onFirstGesture });
    c.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 }));
    c.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    expect(onFirstGesture).toHaveBeenCalledOnce();
    extra.dispose();
  });

  it('dispose detaches all listeners', () => {
    input.dispose();
    canvas.dispatchEvent(pointer('pointerdown', { isPrimary: true, pointerId: 1, clientX: 1, clientY: 1 }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(events).toEqual([]);
    expect(input.isDown('Space')).toBe(false);
  });
});
