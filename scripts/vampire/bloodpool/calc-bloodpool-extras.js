import { debugNs } from "../../logger/ns.js";

const { debug } = debugNs("vampire:bloodpool:calc");

/**
 * Calculate derived Blood Pool values for Vampire sheets.
 *
 * IMPORTANT SYSTEM NOTE:
 * In this WoD20 system, the maximum Blood Pool (by generation) is stored in
 * `actor.system.advantages.bloodpool.max` (derived data), not in `.permanent`.
 *
 * Rules (as requested):
 * - Wake blood cost:
 *   X = 1 + (13 - generation) + (perTurn - 1)
 *
 * - Hunger:
 *   X = ceil((maxBloodPool / 2) + 1 - (selfControl || instincts))
 *
 * Notes:
 * - We keep this function pure: it does not mutate the actor.
 * - We coerce all values to numbers and use safe fallbacks.
 *
 * @param {Actor} actor
 * @returns {{ wakeCost: number, hunger: number, meta: { generation:number, perTurn:number, maxBloodPool:number, virtue:number } }}
 */
export function calcBloodpoolExtras(actor) {
  const generationRaw = foundry.utils.getProperty(actor, "system.generation");
  const perTurnRaw = foundry.utils.getProperty(actor, "system.advantages.bloodpool.perturn");

  // System-derived max Blood Pool (by generation) lives here.
  const maxBloodPoolRaw = foundry.utils.getProperty(actor, "system.advantages.bloodpool.max");
  // Keep a fallback for older/edge actors, but prefer `.max`.
  const fallbackPermanentRaw = foundry.utils.getProperty(actor, "system.advantages.bloodpool.permanent");

  const selfControlRaw = foundry.utils.getProperty(actor, "system.advantages.virtues.selfcontrol.permanent");
  const instinctsRawA = foundry.utils.getProperty(actor, "system.advantages.virtues.instincts.permanent");
  const instinctsRawB = foundry.utils.getProperty(actor, "system.advantages.virtues.instinct.permanent");

  const generation = Number.isFinite(Number(generationRaw)) ? Number(generationRaw) : 13;
  const perTurn = Number.isFinite(Number(perTurnRaw)) ? Number(perTurnRaw) : 1;

  const maxFromSystem = Number.isFinite(Number(maxBloodPoolRaw)) ? Number(maxBloodPoolRaw) : 0;
  const maxFromPermanent = Number.isFinite(Number(fallbackPermanentRaw)) ? Number(fallbackPermanentRaw) : 0;
  const maxBloodPool = maxFromSystem > 0 ? maxFromSystem : maxFromPermanent;

  // Prefer Self-Control; fallback to Instincts if a module/homebrew provides it.
  const selfControl = Number.isFinite(Number(selfControlRaw)) ? Number(selfControlRaw) : 0;
  const instinctsA = Number.isFinite(Number(instinctsRawA)) ? Number(instinctsRawA) : 0;
  const instinctsB = Number.isFinite(Number(instinctsRawB)) ? Number(instinctsRawB) : 0;
  const virtue = selfControl > 0 ? selfControl : (instinctsA > 0 ? instinctsA : instinctsB);

  // Requested formula: 1 + (13 - generation) + (perTurn - 1)
  const wakeCost = 1 + (13 - generation) + (perTurn - 1);

  // Requested formula: ceil((maxBloodPool / 2) + 1 - virtue)
  const hungerRaw = (maxBloodPool / 2) + 1 - virtue;
  const hunger = Math.max(0, Math.ceil(hungerRaw));

  debug("Calculated bloodpool extras", {
    actorId: actor?.id,
    generation,
    perTurn,
    maxBloodPool,
    virtue,
    wakeCost,
    hunger,
  });

  return {
    wakeCost,
    hunger,
    meta: {
      generation,
      perTurn,
      maxBloodPool,
      virtue,
    },
  };
}
