import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from './events';

describe('createEventBus', () => {
  it('delivers emitted payloads to subscribers', () => {
    const bus = createEventBus();
    const seen: number[] = [];
    bus.on('rublesChanged', (p) => seen.push(p.total));
    bus.emit('rublesChanged', { delta: 1, total: 5 });
    bus.emit('rublesChanged', { delta: 1, total: 6 });
    expect(seen).toEqual([5, 6]);
  });

  it('only notifies subscribers of the emitted event', () => {
    const bus = createEventBus();
    const combo = vi.fn();
    bus.on('comboChanged', combo);
    bus.emit('scoreChanged', { delta: 100, total: 100, reason: 'kill' });
    expect(combo).not.toHaveBeenCalled();
  });

  it('preserves subscriber order (deterministic dispatch)', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('incidentStart', () => order.push('a'));
    bus.on('incidentStart', () => order.push('b'));
    bus.on('incidentStart', () => order.push('c'));
    bus.emit('incidentStart', { id: 'pipe' });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('unsubscribes via the returned function', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const unsub = bus.on('comboChanged', fn);
    bus.emit('comboChanged', { multiplier: 2 });
    unsub();
    bus.emit('comboChanged', { multiplier: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes via off()', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.on('comboChanged', fn);
    bus.off('comboChanged', fn);
    bus.emit('comboChanged', { multiplier: 2 });
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() for an unknown event or handler is a no-op', () => {
    const bus = createEventBus();
    expect(() => bus.off('comboChanged', () => {})).not.toThrow();
  });

  it('a throwing handler does not prevent the others from running', () => {
    const bus = createEventBus();
    const after = vi.fn();
    // Swallow the error the bus logs so it doesn't pollute test output.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('incidentEnd', () => {
      throw new Error('boom');
    });
    bus.on('incidentEnd', after);
    bus.emit('incidentEnd', { id: 'x' });
    expect(after).toHaveBeenCalledOnce();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('handlers added during an emit do not fire for the in-flight event', () => {
    const bus = createEventBus();
    const late = vi.fn();
    bus.on('incidentStart', () => {
      bus.on('incidentStart', late);
    });
    bus.emit('incidentStart', { id: 'first' });
    expect(late).not.toHaveBeenCalled();
    bus.emit('incidentStart', { id: 'second' });
    expect(late).toHaveBeenCalledOnce();
  });
});
