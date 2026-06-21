import { describe, it, expect } from 'vitest';
import { createRegistry } from './registry';

interface Pos {
  x: number;
  y: number;
}

describe('createRegistry', () => {
  it('creates entities with distinct ids and lists them in creation order', () => {
    const r = createRegistry();
    const a = r.create();
    const b = r.create();
    expect(a).not.toBe(b);
    expect(r.all()).toEqual([a, b]);
  });

  it('add/get/remove a component', () => {
    const r = createRegistry();
    const id = r.create();
    r.add<Pos>(id, 'pos', { x: 1, y: 2 });
    expect(r.get<Pos>(id, 'pos')).toEqual({ x: 1, y: 2 });
    r.remove(id, 'pos');
    expect(r.get<Pos>(id, 'pos')).toBeUndefined();
  });

  it('get returns undefined for a missing component or unknown key', () => {
    const r = createRegistry();
    const id = r.create();
    expect(r.get<Pos>(id, 'pos')).toBeUndefined();
    expect(r.get<Pos>(999, 'nope')).toBeUndefined();
  });

  it('destroy removes the entity from all() and every component store', () => {
    const r = createRegistry();
    const id = r.create();
    r.add(id, 'pos', { x: 0, y: 0 });
    r.add(id, 'vel', { x: 1, y: 1 });
    r.destroy(id);
    expect(r.all()).not.toContain(id);
    expect(r.get(id, 'pos')).toBeUndefined();
    expect(r.with('pos')).not.toContain(id);
  });

  it('with(...) returns only live entities carrying ALL named components', () => {
    const r = createRegistry();
    const a = r.create();
    const b = r.create();
    const c = r.create();
    r.add(a, 'pos', {});
    r.add(a, 'vel', {});
    r.add(b, 'pos', {});
    r.add(c, 'vel', {});

    expect(r.with('pos')).toEqual([a, b]);
    expect(r.with('vel')).toEqual([a, c]);
    expect(r.with('pos', 'vel')).toEqual([a]);
  });

  it('with() and no keys returns all live entities', () => {
    const r = createRegistry();
    const a = r.create();
    const b = r.create();
    expect(r.with()).toEqual([a, b]);
  });

  it('with(...) for an unknown component returns empty', () => {
    const r = createRegistry();
    r.create();
    expect(r.with('ghost')).toEqual([]);
  });
});
