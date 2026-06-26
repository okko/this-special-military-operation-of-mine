/**
 * Validator for the combat balance table (docs/areas/01-gameplay-engine.md §5). Confirms the gun /
 * spawn / projectile / scaling / difficulty constants are finite and sanely ordered (e.g.
 * minInterval ≤ baseInterval, cooloffResume < 100), so malformed tuning fails loudly at boot rather
 * than producing a broken run. Throws `ContentValidationError` with a locating path.
 */
import { ContentValidationError } from './content-error';
import { asObject, asArray, num } from './validate-helpers';
import type { CombatBalance } from './balance';

function vec2(obj: Record<string, unknown>, key: string, path: string): void {
  const v = asObject(obj[key], `${path}.${key}`);
  num(v, 'x', `${path}.${key}`);
  num(v, 'y', `${path}.${key}`);
}

export function validateCombatBalance(raw: unknown): CombatBalance {
  const path = 'content.combat';
  const root = asObject(raw, path);

  const arena = asObject(root.arena, `${path}.arena`);
  num(arena, 'width', `${path}.arena`, { min: 1 });
  num(arena, 'height', `${path}.arena`, { min: 1 });
  vec2(root, 'postTarget', path);
  num(root, 'escapeRadius', path, { min: 0 });
  num(root, 'postIntegrityMax', path, { min: 1 });

  const gun = asObject(root.gun, `${path}.gun`);
  vec2(gun, 'pivot', `${path}.gun`);
  num(gun, 'turnRate', `${path}.gun`, { min: 0 });
  num(gun, 'fireRate', `${path}.gun`, { min: 0.001 });
  num(gun, 'heatPerShot', `${path}.gun`, { min: 0 });
  num(gun, 'coolRate', `${path}.gun`, { min: 0 });
  const cooloffResume = num(gun, 'cooloffResume', `${path}.gun`, { min: 0, max: 100 });
  if (cooloffResume >= 100) {
    throw new ContentValidationError('gun.cooloffResume must be < 100 (else overheat never clears)', `${path}.gun`);
  }
  num(gun, 'jamClearPerInput', `${path}.gun`, { min: 0.001 });
  num(gun, 'jamClearThreshold', `${path}.gun`, { min: 0.001 });

  const aim = asObject(root.aim, `${path}.aim`);
  num(aim, 'swayFrequencyHz', `${path}.aim`, { min: 0 });
  num(aim, 'drunkFrequencyHz', `${path}.aim`, { min: 0 });
  num(aim, 'swayRadPerUnit', `${path}.aim`, { min: 0 });
  num(aim, 'drunkWobbleRad', `${path}.aim`, { min: 0 });

  const proj = asObject(root.projectile, `${path}.projectile`);
  num(proj, 'speed', `${path}.projectile`, { min: 0.001 });
  num(proj, 'ttl', `${path}.projectile`, { min: 0.001 });
  num(proj, 'radius', `${path}.projectile`, { min: 0 });
  num(proj, 'cap', `${path}.projectile`, { int: true, min: 1 });
  if (typeof proj.hitscan !== 'boolean') {
    throw new ContentValidationError('projectile.hitscan must be a boolean', `${path}.projectile`);
  }

  const spawn = asObject(root.spawn, `${path}.spawn`);
  const baseInterval = num(spawn, 'baseInterval', `${path}.spawn`, { min: 0.001 });
  const minInterval = num(spawn, 'minInterval', `${path}.spawn`, { min: 0.001 });
  if (minInterval > baseInterval) {
    throw new ContentValidationError('spawn.minInterval must be ≤ baseInterval', `${path}.spawn`);
  }
  num(spawn, 'dSoftcap', `${path}.spawn`, { min: 0.001 });
  num(spawn, 'jitter', `${path}.spawn`, { min: 0, max: 1 });
  const baseConcurrent = num(spawn, 'baseConcurrent', `${path}.spawn`, { int: true, min: 1 });
  num(spawn, 'concurrentPerD', `${path}.spawn`, { min: 0 });
  const maxConcurrent = num(spawn, 'maxConcurrent', `${path}.spawn`, { int: true, min: 1 });
  if (maxConcurrent < baseConcurrent) {
    throw new ContentValidationError('spawn.maxConcurrent must be ≥ baseConcurrent', `${path}.spawn`);
  }

  const scaling = asObject(root.scaling, `${path}.scaling`);
  num(scaling, 'speedPerD', `${path}.scaling`, { min: 0 });
  num(scaling, 'hpPerD', `${path}.scaling`, { min: 0 });

  const diff = asObject(root.difficulty, `${path}.difficulty`);
  num(diff, 'rampSeconds', `${path}.difficulty`, { min: 0.001 });
  num(diff, 'maxD', `${path}.difficulty`, { min: 0 });
  num(diff, 'dayLengthSeconds', `${path}.difficulty`, { min: 0.001 });

  const skyline = asObject(root.skyline, `${path}.skyline`);
  num(skyline, 'groundY', `${path}.skyline`);
  num(skyline, 'targetInset', `${path}.skyline`, { min: 0 });
  const buildings = asArray(skyline.buildings, `${path}.skyline.buildings`);
  if (buildings.length === 0) {
    throw new ContentValidationError('skyline.buildings must be non-empty', `${path}.skyline.buildings`);
  }
  const seenIds = new Set<number>();
  buildings.forEach((b, i) => {
    const bp = `${path}.skyline.buildings[${i}]`;
    const bo = asObject(b, bp);
    const id = num(bo, 'id', bp, { int: true, min: 1 });
    if (seenIds.has(id)) throw new ContentValidationError(`duplicate building id ${id}`, bp);
    seenIds.add(id);
    num(bo, 'x', bp);
    num(bo, 'width', bp, { min: 1 });
    num(bo, 'height', bp, { min: 1 });
    num(bo, 'stories', bp, { int: true, min: 1 });
  });

  const waves = asObject(root.waves, `${path}.waves`);
  num(waves, 'firstLullSeconds', `${path}.waves`, { min: 0 });
  num(waves, 'lullSeconds', `${path}.waves`, { min: 0.001 });
  num(waves, 'sirenLeadSeconds', `${path}.waves`, { min: 0 });
  const baseWaveSize = num(waves, 'baseWaveSize', `${path}.waves`, { int: true, min: 1 });
  num(waves, 'waveSizePerWave', `${path}.waves`, { min: 0 });
  const maxWaveSize = num(waves, 'maxWaveSize', `${path}.waves`, { int: true, min: 1 });
  if (maxWaveSize < baseWaveSize) {
    throw new ContentValidationError('waves.maxWaveSize must be ≥ baseWaveSize', `${path}.waves`);
  }
  num(waves, 'spawnInterval', `${path}.waves`, { min: 0.001 });
  num(waves, 'spawnJitter', `${path}.waves`, { min: 0, max: 1 });

  const repair = asObject(root.repair, `${path}.repair`);
  num(repair, 'passiveIntegrityPerSec', `${path}.repair`, { min: 0 });
  num(repair, 'passiveSlabPerSec', `${path}.repair`, { min: 0 });
  num(repair, 'paidIntegrity', `${path}.repair`, { min: 0 });
  num(repair, 'paidSlabs', `${path}.repair`, { min: 0 });
  num(repair, 'slabsPerDamage', `${path}.repair`, { min: 0 });

  return raw as CombatBalance;
}
