/**
 * Bootstrap + game loop driver. This is the ONLY module that reads the real clock
 * (`performance.now()`) and drives `requestAnimationFrame`; everything downstream receives a
 * fixed `dt` (docs/architecture.md §3, docs/areas/00-core-platform.md §3.2). It wires the core
 * substrate, persistence, render, input, and the scene manager together.
 */
import { createRng } from './core/rng';
import { createEventBus } from './core/events';
import { stepLoop } from './core/loop';
import { loadContent } from './content/loader';
import { createStorage } from './persistence/storage';
import { createMetaStatsRepo } from './persistence/meta-stats-repo';
import { wireGameOver } from './persistence/gameover-wiring';
import { createScaler } from './render/scaler';
import { createCanvasRenderer } from './render/canvas-renderer';
import { createPlaceholderProvider, createManifestProvider } from './render/sprite-provider';
import { createInput } from './input/input';
import { createSceneManager } from './state/scene-manager';
import { createBootScene } from './state/boot-scene';
import { createPlaceholderScene } from './state/placeholder-scene';
import manifestJson from './content/assets.manifest.json';
import type { SystemContext } from './core/system-context';

function main(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('main: #game canvas not found');
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error('main: 2D canvas context unavailable');
  const rotateOverlay = document.getElementById('rotate-overlay') ?? undefined;

  // Core substrate + injected context.
  const rng = createRng(0x1234abcd);
  const events = createEventBus();
  const content = loadContent({ manifest: manifestJson }); // throws loudly on malformed data
  const ctx: SystemContext = { rng, events, content };

  // Persistence (settings/highscores repos are consumed by menus/audio in later phases).
  const storage = createStorage();
  const meta = createMetaStatsRepo(storage);

  // Render.
  const scaler = createScaler(canvas, rotateOverlay);
  const sprites = createManifestProvider(content.manifest, createPlaceholderProvider());
  const renderer = createCanvasRenderer(ctx2d, sprites);

  // Scene machine + the Phase-1 reachable scenes.
  const manager = createSceneManager(ctx, 'Boot');
  manager.register('Boot', () => createBootScene(manager, meta));
  manager.register('MainMenu', () => createPlaceholderScene('ONE RUBLE PER DRONE', '1 ₽ / drone'));
  wireGameOver(events, manager, meta);

  // Input (the audio-unlock hook is consumed by the Audio area in a later phase).
  createInput(canvas, scaler, {
    onEvent: (e) => manager.routeInput(e),
    onFirstGesture: () => {
      /* Audio area resumes the AudioContext here. */
    },
  });

  // Viewport: drive resize from visualViewport (handles the iOS URL-bar reflow).
  const resize = (): void => {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    scaler.resize(vw, vh);
  };
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // Auto-pause when backgrounded (docs/compatibility.md §5).
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
  });
  window.addEventListener('pagehide', () => {
    paused = true;
  });

  // Fixed-timestep loop; logic only ever sees a constant dt via stepLoop.
  let accumulator = 0;
  let prev = performance.now();
  const frame = (now: number): void => {
    const frameDt = (now - prev) / 1000;
    prev = now;
    if (!paused) {
      const step = stepLoop(accumulator, frameDt, (dt) => manager.update(dt, ctx));
      accumulator = step.accumulator;
      renderer.setAlpha(step.alpha);
    }
    manager.render(renderer);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

main();
