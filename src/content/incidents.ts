/**
 * Random-incident catalog + scheduler tunables (docs/areas/05-random-incidents.md §5). DATA, not
 * logic. Each incident contributes to the shared `IncidentFlags` via `apply` using the documented
 * compose rules — multipliers MULTIPLY (`*=`), `blackout` composes by MAX, booleans OR — so two
 * active incidents stack predictably. The scheduler/lifecycle/overlap logic lives in
 * `src/systems/incidents.ts`. Validated by `validateIncidentCatalog`, exposed as `content.incidents`.
 *
 * COMPLIANCE (docs/compliance.md): names are cheerful, flavor is grim, and every joke targets the
 * regime / war / building's failures — never ordinary people.
 */
import type { SystemContext } from '../core/system-context';
import type { IncidentFlags, IncidentCategory } from '../state/game-state';

export interface ResolutionSpec {
  kind: 'kill' | 'clear' | 'pay'; // how the player ends it early (flavor; the Engine enacts the action)
}

export interface IncidentDef {
  id: string;
  name: string; // cheerful
  flavor: string; // grim
  category: IncidentCategory;
  exclusive: boolean;
  minDifficulty: number;
  weight: (D: number) => number; // relative roll weight at difficulty D
  telegraphSeconds: number; // fair-warning lead time (>= 2)
  durationSeconds: number; // timed length (Infinity if only player-resolvable)
  cooldownSeconds: number; // per-incident reuse cooldown
  apply: (flags: IncidentFlags) => void; // contribute to flags (compose, never assign multipliers)
  resolution?: ResolutionSpec; // present => player-resolvable
  crisisOnExpiry?: (ctx: SystemContext) => void; // one-shot penalty if it lapses unresolved
}

export interface SchedulerTunables {
  baseInterval: number; // mean seconds between incidents at D = 0
  minInterval: number; // floor on the mean interval at high D
  rate: number; // how fast frequency rises with D
  postIncidentCooldown: number; // global gap enforced after any incident ends
  gracePeriod: number; // opening incident-free window
  maxConcurrent: number; // hard cap on simultaneously-active incidents
}

export const schedulerTunables: SchedulerTunables = {
  baseInterval: 30,
  minInterval: 8,
  rate: 0.15,
  postIncidentCooldown: 6,
  gracePeriod: 20,
  maxConcurrent: 2,
};

export const INCIDENTS: IncidentDef[] = [
  {
    id: 'pipe_failure',
    name: 'Spa Day Downstairs!',
    flavor: 'The plumbing has surrendered. The good bathroom is a no-go until it is fixed.',
    category: 'plumbing',
    exclusive: false,
    minDifficulty: 0,
    weight: () => 1,
    telegraphSeconds: 3,
    durationSeconds: 15,
    cooldownSeconds: 40,
    apply: (f) => {
      f.toiletBlocked = true;
    },
  },
  {
    id: 'swarm',
    name: 'Welcome Committee!',
    flavor: 'A great many drones would like a word. All at once.',
    category: 'combat',
    exclusive: false,
    minDifficulty: 1,
    weight: (D) => 1 + D * 0.1,
    telegraphSeconds: 3,
    durationSeconds: 12,
    cooldownSeconds: 30,
    apply: (f) => {
      f.spawnRateMultiplier *= 3;
    },
  },
  {
    id: 'boss_drone',
    name: 'VIP Visitor!',
    flavor: 'A very important, very armored drone has come to inspect your marksmanship.',
    category: 'combat',
    exclusive: true,
    minDifficulty: 3,
    weight: (D) => D * 0.2,
    telegraphSeconds: 4,
    durationSeconds: 25,
    cooldownSeconds: 60,
    apply: (f) => {
      f.bossActive = true;
      f.spawnRateMultiplier *= 1.5;
    },
    resolution: { kind: 'kill' },
  },
  {
    id: 'blackout',
    name: 'Cozy Candlelight!',
    flavor: 'The lights are off across the district. Rest is hard to come by in the dark.',
    category: 'power',
    exclusive: false,
    minDifficulty: 2,
    weight: () => 0.8,
    telegraphSeconds: 3,
    durationSeconds: 14,
    cooldownSeconds: 45,
    apply: (f) => {
      f.blackout = Math.max(f.blackout, 0.7);
      f.sleepGainMultiplier *= 1.5;
    },
  },
  {
    id: 'gun_jam',
    name: 'Percussive Maintenance Time!',
    flavor: 'The barrel has jammed. A few good thumps should do it.',
    category: 'power',
    exclusive: false,
    minDifficulty: 1,
    weight: () => 1,
    telegraphSeconds: 2,
    durationSeconds: 8,
    cooldownSeconds: 30,
    apply: (f) => {
      f.gunJammed = true;
    },
    resolution: { kind: 'clear' },
  },
  {
    id: 'broken_elevator',
    name: 'Take the Stairs!',
    flavor: 'The lift is out, so deliveries are not coming up any time soon.',
    category: 'service',
    exclusive: false,
    minDifficulty: 1,
    weight: () => 0.8,
    telegraphSeconds: 3,
    durationSeconds: 16,
    cooldownSeconds: 45,
    apply: (f) => {
      f.servicesDisabled = true;
    },
  },
  {
    id: 'resident_party',
    name: 'Neighbourly Festivities!',
    flavor: 'Someone is celebrating loudly. Sleep is not on the guest list.',
    category: 'social',
    exclusive: false,
    minDifficulty: 0,
    weight: () => 0.7,
    telegraphSeconds: 3,
    durationSeconds: 14,
    cooldownSeconds: 40,
    apply: (f) => {
      f.sleepGainMultiplier *= 1.8;
    },
  },
  {
    id: 'supply_shortage',
    name: 'Premium Pricing Event!',
    flavor: 'Everything is suddenly twice the price. The market regrets the inconvenience.',
    category: 'service',
    exclusive: false,
    minDifficulty: 1,
    weight: () => 0.8,
    telegraphSeconds: 3,
    durationSeconds: 16,
    cooldownSeconds: 45,
    apply: (f) => {
      f.servicePriceMultiplier *= 2;
    },
  },
  {
    id: 'propaganda',
    name: 'Mandatory Good News!',
    flavor: 'A triumphant broadcast demands your full attention. Resistance is impolite.',
    category: 'authority',
    exclusive: true,
    minDifficulty: 2,
    weight: () => 0.5,
    telegraphSeconds: 2,
    durationSeconds: 3, // kept short — input is locked while it plays
    cooldownSeconds: 60,
    apply: (f) => {
      f.inputLocked = true;
    },
  },
  {
    id: 'bird_flock',
    name: 'Feathered Friends!',
    flavor: 'A flock drifts across the skyline. They are not drones. Shooting them is frowned upon.',
    category: 'nature',
    exclusive: false,
    minDifficulty: 0,
    weight: () => 0.6,
    telegraphSeconds: 3,
    durationSeconds: 12,
    cooldownSeconds: 35,
    apply: (f) => {
      f.decoysActive = true;
    },
  },
  {
    id: 'inspection',
    name: 'Surprise Inspection!',
    flavor: 'An official has arrived expecting a small token of appreciation.',
    category: 'authority',
    exclusive: false,
    minDifficulty: 2,
    weight: () => 0.5,
    telegraphSeconds: 3,
    durationSeconds: 10,
    cooldownSeconds: 60,
    apply: () => {
      /* no live flags — the pressure is the looming penalty */
    },
    resolution: { kind: 'pay' },
    crisisOnExpiry: (ctx) => {
      ctx.events.emit('incidentPenalty', { id: 'inspection' });
    },
  },
  {
    id: 'cold_snap',
    name: 'Bracing Fresh Air!',
    flavor: 'A cold front rolls in. Staying awake takes a little more effort.',
    category: 'nature',
    exclusive: false,
    minDifficulty: 0,
    weight: (D) => Math.max(0, 2 - D * 0.2), // low-D filler; fades as the shift heats up
    telegraphSeconds: 3,
    durationSeconds: 12,
    cooldownSeconds: 40,
    apply: (f) => {
      f.sleepGainMultiplier *= 1.3;
    },
  },
];
