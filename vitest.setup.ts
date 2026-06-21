// jsdom does not implement PointerEvent (only MouseEvent), but our input layer is built on
// Pointer Events (docs/compatibility.md §4). This shim makes `new PointerEvent(...)` and the
// pointerId/isPrimary/pointerType fields available in jsdom-environment tests. It is a no-op
// in the default node environment (no `window`).
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends window.MouseEvent {
    public readonly pointerId: number;
    public readonly isPrimary: boolean;
    public readonly pointerType: string;
    public readonly width: number;
    public readonly height: number;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.isPrimary = params.isPrimary ?? false;
      this.pointerType = params.pointerType ?? 'mouse';
      this.width = params.width ?? 1;
      this.height = params.height ?? 1;
    }
  }
  // Assigning onto window: the shim satisfies the subset of PointerEvent our code reads.
  (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    PointerEventShim as unknown as typeof PointerEvent;
  (globalThis as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent =
    PointerEventShim as unknown as typeof PointerEvent;
}

export {};
