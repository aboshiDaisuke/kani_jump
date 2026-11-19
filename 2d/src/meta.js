import { COSMETICS, MISSION_POOL, STORAGE_KEYS, UPGRADES } from './config.js';

export function createDefaultMeta() {
  return {
    bankStars: 0,
    ownedCosmetics: ['none'],
    equippedCosmetic: 'none',
    upgrades: {
      magnet: 0,
      fever: 0,
      shield: 0,
    },
    unlockedStage: 0, // 0..3
    completedMissions: [],
    activeMissions: MISSION_POOL.slice(0, 3).map((m) => m.id),
    lifetime: {
      runs: 0,
      totalStars: 0,
      totalBounces: 0,
      totalSmashes: 0,
    },
  };
}

export function loadMeta(storage = globalThis.localStorage) {
  const def = createDefaultMeta();
  try {
    const raw = storage?.getItem?.(STORAGE_KEYS.meta);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    const meta = {
      ...def,
      ...parsed,
      upgrades: { ...def.upgrades, ...(parsed.upgrades || {}) },
      lifetime: { ...def.lifetime, ...(parsed.lifetime || {}) },
    };
    if (!Array.isArray(meta.ownedCosmetics) || !meta.ownedCosmetics.includes('none')) {
      meta.ownedCosmetics = ['none', ...(meta.ownedCosmetics || [])];
    }
    if (!Array.isArray(meta.activeMissions) || meta.activeMissions.length === 0) {
      meta.activeMissions = pickNextMissions(meta.completedMissions, 3);
    }
    return meta;
  } catch {
    return def;
  }
}

export function saveMeta(meta, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(STORAGE_KEYS.meta, JSON.stringify(meta));
  } catch {
    // ignore storage limits
  }
}

export function pickNextMissions(completedIds, count = 3) {
  const done = new Set(completedIds);
  const remaining = MISSION_POOL.filter((m) => !done.has(m.id));
  if (remaining.length >= count) {
    return remaining.slice(0, count).map((m) => m.id);
  }
  return remaining.map((m) => m.id);
}

export function getMissionDef(id) {
  return MISSION_POOL.find((m) => m.id === id) || null;
}

export function getUpgradeValue(meta, upgradeId) {
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return 0;
  const lv = Math.max(0, Math.min(def.maxLevel, meta.upgrades[upgradeId] || 0));
  return def.values[lv];
}

export function buyOrEquipCosmetic(meta, cosmeticId) {
  const item = COSMETICS.find((c) => c.id === cosmeticId);
  if (!item) return { ok: false, reason: 'not_found' };
  if (meta.ownedCosmetics.includes(cosmeticId)) {
    meta.equippedCosmetic = cosmeticId;
    return { ok: true, action: 'equipped', item };
  }
  if (meta.bankStars < item.price) {
    return { ok: false, reason: 'insufficient_stars' };
  }
  meta.bankStars -= item.price;
  meta.ownedCosmetics.push(cosmeticId);
  meta.equippedCosmetic = cosmeticId;
  return { ok: true, action: 'bought', item };
}

export function buyUpgrade(meta, upgradeId) {
  const def = UPGRADES.find((u) => u.id === upgradeId);
  if (!def) return { ok: false, reason: 'not_found' };
  const lv = meta.upgrades[upgradeId] || 0;
  if (lv >= def.maxLevel) return { ok: false, reason: 'max_level' };
  const price = def.prices[lv];
  if (meta.bankStars < price) return { ok: false, reason: 'insufficient_stars' };
  meta.bankStars -= price;
  meta.upgrades[upgradeId] = lv + 1;
  return { ok: true, level: lv + 1, def };
}

/**
 * Check active missions against current run metrics.
 * Returns array of newly completed mission definitions (and mutates meta to bank rewards & refill missions).
 */
export function evaluateMissions(meta, runMetrics) {
  const newlyCompleted = [];
  const remainingActive = [];

  for (const id of meta.activeMissions) {
    const m = getMissionDef(id);
    if (!m) continue;
    const val = runMetrics[m.stat] || 0;
    if (val >= m.target) {
      newlyCompleted.push(m);
      if (!meta.completedMissions.includes(m.id)) {
        meta.completedMissions.push(m.id);
      }
      meta.bankStars += m.reward;
    } else {
      remainingActive.push(id);
    }
  }

  if (newlyCompleted.length > 0) {
    const doneSet = new Set([...meta.completedMissions, ...remainingActive]);
    for (const candidate of MISSION_POOL) {
      if (remainingActive.length >= 3) break;
      if (!doneSet.has(candidate.id)) {
        remainingActive.push(candidate.id);
        doneSet.add(candidate.id);
      }
    }
    meta.activeMissions = remainingActive;
  }

  return newlyCompleted;
}
