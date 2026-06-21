/**
 * A minimal scene that paints a centered title over a cheerful sky (docs/areas/00-core-platform.md
 * §2: "Boot/empty placeholders"). Real scenes (MainMenu, Playing, …) replace these in later
 * phases; this keeps `npm run dev` showing something stable and lets the scene FSM run end-to-end.
 */
import type { Scene } from './scene';

export function createPlaceholderScene(title: string, subtitle = ''): Scene {
  return {
    enter(): void {},
    update(): void {},
    render(r): void {
      r.clear('skyDayTop');
      r.text(title, r.width / 2, r.height / 2 - 8, { align: 'center', color: 'cream' });
      if (subtitle) r.text(subtitle, r.width / 2, r.height / 2 + 6, { align: 'center', color: 'cream' });
    },
    onInput(): void {},
    exit(): void {},
  };
}
