/**
 * The canonical color palette (docs/areas/11-art-visual-style.md §3.2). Bright, saturated
 * SNES-era hues. Code references palette KEYS, never raw hex literals.
 *
 * Budget: ≤ 32 unique hex values (enforced by palette.test.ts). The §3.2 table lists ~39 keys,
 * so several near-duplicate keys deliberately share a hex value (the doc's suggested approach,
 * e.g. `windowLit` reuses `explYellow`). Keys stay distinct so call sites read meaningfully;
 * only the hex values dedupe.
 */
export const PALETTE = Object.freeze({
  // Line/shadow
  ink: '#1a1c2c',
  shadow: '#2b2f4a',
  // Sky (day)
  skyDayTop: '#4fc3ff',
  skyDayMid: '#8be9fd',
  skyDayLow: '#fff3b0', // shares `flash`
  // Sky (night)
  skyNightTop: '#1b1f5c',
  skyNightMid: '#3a2f7a',
  // Clouds
  cloud: '#ffffff',
  // Domes
  domeGold: '#ffcb3d',
  domeTeal: '#2ec4b6',
  domeRed: '#e84a5f',
  // Buildings
  concrete: '#9aa0b5',
  concreteDk: '#6b7088',
  windowLit: '#ffd23f', // shares `explYellow`
  windowDark: '#3b4a6b',
  // Soldier
  uniform: '#6e7d3b',
  uniformDk: '#4a5526',
  skin: '#f2c79a',
  skinDk: '#c98e63',
  // Gun / FX
  gunmetal: '#5a6172',
  gunmetalDk: '#353a4a',
  flash: '#fff3b0',
  flashHot: '#ff9f1c',
  // Drones
  droneBody: '#5a6172', // shares `gunmetal`
  droneScout: '#4fc3ff', // shares `skyDayTop`
  droneBomber: '#ff3b3b', // shares `meterCrit`
  droneSwarm: '#b06cff',
  droneBoss: '#ff2e63',
  // Explosion / smoke
  explYellow: '#ffd23f',
  explOrange: '#ff7b00',
  smoke: '#c7ccd6',
  // Economy
  rubleGold: '#ffcb3d', // shares `domeGold`
  // UI
  panel: '#2440a0',
  panelLite: '#4f7cff',
  cream: '#fff6e6',
  accentPink: '#ff5db1',
  // Meters
  meterGood: '#3ddc84',
  meterWarn: '#ff9f1c', // shares `flashHot`
  meterCrit: '#ff3b3b',
} as const);

export type PaletteKey = keyof typeof PALETTE;
