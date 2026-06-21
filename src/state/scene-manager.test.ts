import { describe, it, expect } from 'vitest';
import {
  createSceneManager,
  TRANSITIONS,
  IllegalTransitionError,
  type SceneManager,
} from './scene-manager';
import type { Scene, SceneId } from './scene';
import type { SystemContext } from '../core/system-context';
import type { InputEvent } from '../input/input';

// Stub scenes use a fake ctx (they ignore it); SystemContext is never touched by the FSM logic.
const CTX = {} as SystemContext;
const ALL_IDS = Object.keys(TRANSITIONS) as SceneId[];

interface StubCalls {
  enterParams: unknown[];
  update: number;
  render: number;
  exit: number;
  input: InputEvent[];
}

function makeStub(name: string, log: string[]): { scene: Scene<unknown>; calls: StubCalls } {
  const calls: StubCalls = { enterParams: [], update: 0, render: 0, exit: 0, input: [] };
  const scene: Scene<unknown> = {
    enter(params) {
      calls.enterParams.push(params);
      log.push(`${name}:enter`);
    },
    update() {
      calls.update += 1;
    },
    render() {
      calls.render += 1;
    },
    onInput(e) {
      calls.input.push(e);
    },
    exit() {
      calls.exit += 1;
      log.push(`${name}:exit`);
    },
  };
  return { scene, calls };
}

function setup(initial: SceneId): {
  manager: SceneManager;
  stubs: Record<string, ReturnType<typeof makeStub>>;
  log: string[];
} {
  const log: string[] = [];
  const stubs: Record<string, ReturnType<typeof makeStub>> = {};
  const manager = createSceneManager(CTX, initial);
  for (const id of ALL_IDS) {
    const s = makeStub(id, log);
    stubs[id] = s;
    manager.register(id, () => s.scene);
  }
  return { manager, stubs, log };
}

describe('SceneManager transition graph', () => {
  it('accepts every legal transition in TRANSITIONS', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        const { manager } = setup(from as SceneId);
        manager.transition(to);
        expect(manager.active, `${from} → ${to}`).toBe(to);
      }
    }
  });

  it('rejects illegal transitions and leaves active unchanged', () => {
    const illegal: ReadonlyArray<[SceneId, SceneId]> = [
      ['Boot', 'Settings'],
      ['MainMenu', 'GameOver'],
      ['Highscores', 'Playing'],
    ];
    for (const [from, to] of illegal) {
      const { manager } = setup(from);
      expect(() => manager.transition(to)).toThrow(IllegalTransitionError);
      expect(manager.active).toBe(from);
    }
  });

  it('calls A.exit() before B.enter() on a transition', () => {
    const { manager, log } = setup('Boot');
    manager.transition('MainMenu');
    expect(log).toEqual(['Boot:enter', 'Boot:exit', 'MainMenu:enter']);
  });

  it('passes typed params into enter (GameOver gets {score, cause})', () => {
    const { manager, stubs } = setup('Playing');
    manager.transition('GameOver', { score: 1234, cause: 'post-integrity' });
    expect(stubs.GameOver?.calls.enterParams[0]).toEqual({ score: 1234, cause: 'post-integrity' });
  });
});

describe('Pause overlay semantics', () => {
  it('pushOverlay(Paused) does not exit Playing and freezes its update', () => {
    const { manager, stubs } = setup('Playing');
    manager.update(0.016, CTX); // Playing entered + updated once
    manager.pushOverlay('Paused');
    expect(manager.active).toBe('Playing');
    expect(manager.overlay).toBe('Paused');
    expect(stubs.Playing?.calls.exit).toBe(0);

    const before = stubs.Playing?.calls.update ?? 0;
    manager.update(0.016, CTX); // dispatched to the overlay, not Playing
    expect(stubs.Playing?.calls.update).toBe(before);
    expect(stubs.Paused?.calls.update).toBeGreaterThan(0);
  });

  it('popOverlay resumes Playing.update', () => {
    const { manager, stubs } = setup('Playing');
    manager.pushOverlay('Paused');
    manager.popOverlay();
    expect(manager.overlay).toBeNull();
    const before = stubs.Playing?.calls.update ?? 0;
    manager.update(0.016, CTX);
    expect(stubs.Playing?.calls.update).toBe(before + 1);
  });

  it('rejects an illegal overlay (Paused over MainMenu)', () => {
    const { manager } = setup('MainMenu');
    expect(() => manager.pushOverlay('Paused')).toThrow(IllegalTransitionError);
  });

  it('rejects a second overlay while one is already active', () => {
    const { manager } = setup('Playing');
    manager.pushOverlay('Paused');
    expect(() => manager.pushOverlay('Paused')).toThrow(/already active/);
  });

  it('abandon-run (Paused → MainMenu) exits BOTH the overlay and Playing', () => {
    const { manager, stubs } = setup('Playing');
    manager.pushOverlay('Paused');
    manager.transition('MainMenu');
    expect(manager.active).toBe('MainMenu');
    expect(manager.overlay).toBeNull();
    expect(stubs.Playing?.calls.exit).toBe(1);
    expect(stubs.Paused?.calls.exit).toBe(1);
  });
});

describe('rendering and input routing', () => {
  it('renders the active scene, then the overlay on top', () => {
    const { manager, stubs } = setup('Playing');
    manager.pushOverlay('Paused');
    manager.render({ width: 384, height: 216, alpha: 0 } as never);
    expect(stubs.Playing?.calls.render).toBeGreaterThan(0); // frozen scene still drawn
    expect(stubs.Paused?.calls.render).toBeGreaterThan(0);
  });

  it('routes input to the overlay when present, else the active scene', () => {
    const { manager, stubs } = setup('Playing');
    manager.routeInput({ type: 'fireDown' });
    expect(stubs.Playing?.calls.input).toHaveLength(1);

    manager.pushOverlay('Paused');
    manager.routeInput({ type: 'fireUp' });
    expect(stubs.Paused?.calls.input).toHaveLength(1);
    expect(stubs.Playing?.calls.input).toHaveLength(1); // unchanged — overlay intercepted
  });
});

describe('registration errors', () => {
  it('throws if transitioning to an unregistered scene', () => {
    const manager = createSceneManager(CTX, 'Boot');
    manager.register('Boot', () => makeStub('Boot', []).scene);
    expect(() => manager.transition('MainMenu')).toThrow(/no factory registered/);
  });
});
