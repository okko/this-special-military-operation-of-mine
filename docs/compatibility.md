# Cross-Browser & Mobile Compatibility

> Status: **Foundation doc (mandatory).** Defines the browser support floor, the
> mobile/touch control scheme, the iOS-Safari requirements, and the cross-browser
> test matrix. Read alongside `architecture.md`, `testing.md`, and the area docs it
> references. Any area that **renders, takes input, plays audio, or persists** must
> satisfy its row in §9.

## 1. Support matrix

The game ships as static files and must play well on touch **and** desktop.

| Class | Targets (support floor) |
|---|---|
| Desktop | Last 2 versions of Chrome, Edge, Firefox, **Safari** |
| iOS / iPadOS | **Safari 15.4+** (mobile is a first-class target) |
| Android | Chrome (last 2), Samsung Internet (last 2) |

The 15.4+ floor is deliberate: it lets us rely on **Pointer Events**, the dynamic
viewport units (`dvh`/`svh`/`lvh`), and `image-rendering: pixelated` without polyfills.
Anything below the floor may degrade but is not gated.

## 2. Rendering & canvas

- **Pixel-art scaling.** Emit `image-rendering: pixelated` **and**, defensively,
  `-webkit-optimize-contrast` / `crisp-edges`, plus `ctx.imageSmoothingEnabled = false`.
- **Backing buffer stays 384×216.** Never allocate a device-pixel-sized canvas — on
  mobile that is a memory/fill-rate trap. The 384×216 buffer is **CSS-scaled** by the
  largest integer that fits the viewport (letterboxed). High-DPI crispness comes from
  `image-rendering`, not from a larger buffer.
- **All five meter icons are pixel-art atlas sprites (see `11-art-visual-style.md
  §3.4`).** Color-emoji rendered via `fillText` differ across platforms
  (Apple/Google/Microsoft) and blur at 384×216, so **no** meter indicator uses it. The
  poo icon is a pixel-art sprite **designed to read as the poo emoji 💩** — the brief
  only requires it to *look like* 💩, not be the literal system glyph — and it is
  authored/rendered exactly like the other four (😴🍞💧🚬). Every meter icon is
  therefore pixel-consistent on every engine.
- **Snapshot scope.** A per-engine Playwright screenshot snapshot guards **all five**
  icons together (they must match across Chromium/WebKit/Firefox) — no emoji-glyph
  special case, no per-OS variance to tolerate.

## 3. Viewport, orientation, and safe areas

- **Sizing source.** Drive the scaler's `resize()` from **`window.visualViewport`**
  (width/height) when present, falling back to `window.innerWidth/innerHeight`. Listen
  to `visualViewport` `resize`, `orientationchange`, and `resize` (debounced) so the
  iOS Safari URL-bar show/hide reflow is handled instead of clipping the canvas.
- **CSS height.** Use **`100dvh`** with a `100vh` fallback so the iOS toolbar does not
  crop the game. Set the viewport meta to `viewport-fit=cover` and pad HUD/letterbox
  with `env(safe-area-inset-*)` so nothing important sits under the notch or home
  indicator.
- **Orientation.** The game is 16:9 **landscape**. On a portrait phone, show a
  cheerful **"rotate to landscape" overlay** rather than a tiny letterboxed strip.
  The Screen Orientation **lock** API is unsupported on iOS Safari — we *prompt*, we
  cannot force.
- **Fullscreen.** Unavailable on iPhone Safari. Do **not** depend on it; offer a
  fullscreen toggle only where the API exists.

## 4. Input & the touch control scheme

**Standardize on Pointer Events** (`pointerdown` / `pointermove` / `pointerup` /
`pointercancel`) as the single input source. Pointer Events unify mouse, touch, and
pen across the whole support floor, so there is no separate "mouse path" and "touch
path." Mouse- and Touch-specific listeners are avoided.

**Chosen control scheme — touch-to-aim, hold to fire:**

- **Touch:** a `pointerdown` in the play area sets the gun's aim to that world point
  and **starts continuous fire**; `pointermove` updates the aim; `pointerup` stops
  firing. Only the **primary pointer** aims/fires; secondary pointers are ignored (or
  routed to the on-screen intercom button — §9, HUD).
- **`pointercancel` must be handled as a fire-up.** iOS fires it when a gesture is
  interrupted (incoming call, notification, system gesture). If we don't treat it as
  fire-up, the gun sticks firing. This is a required test case.
- **Desktop (retained):** mouse move aims (hover), mouse button held fires; the
  keyboard fallback (A/D rotate the barrel, Space fires) remains fully playable.
- The existing overheat / jam firing model is driven by the **same** fire-down/up
  signals — there is no separate mobile firing code path.

**Canvas gesture hygiene (CSS + handlers):** `touch-action: none`, `user-select: none`,
`-webkit-user-select: none`, `-webkit-touch-callout: none`, and `preventDefault` on
pointer/touch events to suppress scrolling, double-tap-zoom, pull-to-refresh, and the
long-press selection callout. Reuse the existing `InputEvent` union and `Scaler`
contract — **extend, don't replace.**

**Pointer→world mapping:** compute from `getBoundingClientRect()` + `clientX/clientY`
(not `offsetX/offsetY`, which differ across browsers), minus the letterbox offset,
divided by the integer CSS scale.

## 5. Audio unlock & backgrounding (iOS)

- `WebAudioBackend` constructs via `AudioContext ?? webkitAudioContext`.
- The context starts **suspended**; `resume()` must be called **synchronously inside
  the first user-gesture handler** (`pointerdown`/`keydown`/`touchend`) — iOS will not
  unlock from a deferred/async callback. The existing Core input unlock hook wires
  this; this doc fixes the gesture types and the synchronous requirement.
- **Backgrounding.** iOS suspends the context when the tab/app goes to the background.
  On `visibilitychange` (hidden) **auto-pause the game**; on visible again, call
  `resume()` before unpausing. Also handle `pagehide`.

## 6. Persistence (Safari specifics)

- **Private Mode.** iOS Safari Private Mode throws `QuotaExceededError` on the first
  **`setItem`**, not at construction. The storage wrapper must catch **at write time**
  and transparently switch to the in-memory backend; the game keeps running, data just
  doesn't persist. (See `09-state-and-persistence.md` — required test #12 is extended
  to cover "throws on first write after a clean construction.")
- **ITP eviction.** Safari may evict `localStorage` after ~7 days of no interaction;
  highscores/settings can vanish. Acceptable for a single-player browser game —
  documented as a known limitation, not worked around.

## 7. Mobile performance budget

The booted `Playing` scene must hold a frame-time budget on an emulated mid-tier
mobile (Playwright CPU throttling) with a representative drone count, running N seconds
without errors or unbounded growth. This reinforces the existing "no per-frame
allocations" principle and the audio voice-cap; regressions fail the matrix.

## 8. The cross-browser test matrix (mandatory)

`@playwright/test` runs as a **required CI gate** (replacing the old "optional smoke
test"), across **Chromium, WebKit (Safari engine), Firefox, and an emulated iPhone
(WebKit) viewport**. Minimum suite:

1. Boots to MainMenu without console errors on every engine.
2. Starts a run; a tap/click in the sky aims + fires and destroys a drone (covers the
   §4 control scheme and `pointercancel` → cease-fire).
3. Audio context reaches `running` after the first gesture (§5).
4. `localStorage` round-trips, and the in-memory fallback path works when storage
   throws (§6).
5. Mobile-viewport run holds the §7 frame-time budget under CPU throttling.
6. HUD glyph-row screenshot snapshot matches per engine (§2 emoji sprites).

**Caveat (documented, accepted by the owner):** WebKit-in-Playwright approximates the
Safari engine but is **not identical** to real iOS Safari for audio unlock, storage
eviction, and `100vh`/safe-area behavior. The owner chose the engine matrix as the
gate; a manual **real-iOS-Safari spot-check per release** is recommended as advisory
follow-up, not a blocking gate.

## 9. Per-area compatibility responsibilities

| Area | Owns |
|---|---|
| 00 Core Platform | Pointer Events input + `pointercancel`; canvas gesture CSS; scaler DPR/`visualViewport`/safe-area/orientation; the Playwright matrix config; pointer→world mapping. |
| 01 Gameplay Engine | Aim + hold-to-fire from the pointer; overheat/jam under held touch. |
| 06 Audio | `webkitAudioContext` fallback; synchronous in-gesture unlock; visibility resume + auto-pause. |
| 09 State & Persistence | Write-time private-mode fallback; ITP limitation note. |
| 10 HUD & UI | On-screen intercom button (touch); minimum tap-target sizes; safe-area-aware layout; five-icon sprite snapshot. |
| 11 Art & Visual Style | `image-rendering` fallbacks; pixel-art atlas sprites for all five meter icons (incl. a poo icon that reads as 💩), authored consistently. |
| 07 Main Menu / 08 Highscores / 12 Credits | Pointer + keyboard navigable; readable and tappable at mobile scale within safe areas. |
