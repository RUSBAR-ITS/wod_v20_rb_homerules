import { debugNs } from "../logger/ns.js";
import { FATE_RULES } from "../constants/fate-rules.js";
import { FATE_DATA } from "../constants/fate-data.js";

const { debug, info, error } = debugNs("fate:data");

function clampInt(value, min, max) {
  const v = Number.isFinite(Number(value)) ? parseInt(value, 10) : min;
  return Math.min(max, Math.max(min, v));
}

function computeRoll(permanent, temporary) {
  return FATE_RULES.ROLL_SOURCE === "temporary" ? temporary : permanent;
}

export async function ensureFateData(actor) {
  try {
    const pathBase = FATE_DATA.PATH_BASE_SYSTEM;
    const existing = actor?.system?.advantages?.fate ?? {};

    const max = clampInt(existing.max ?? FATE_RULES.DEFAULTS.max, 0, FATE_RULES.MAX_CAP);
    const permanent = clampInt(existing.permanent ?? FATE_RULES.DEFAULTS.permanent, 0, max);
    const temporary = clampInt(existing.temporary ?? FATE_RULES.DEFAULTS.temporary, 0, permanent);

    const rollExpected = clampInt(
      computeRoll(permanent, temporary),
      0,
      max
    );

    const needsUpdate =
      existing.max !== max ||
      existing.permanent !== permanent ||
      existing.temporary !== temporary ||
      existing.roll !== rollExpected;

    if (!needsUpdate) return;

    debug("Ensuring fate data", {
      actorId: actor?.id,
      max,
      permanent,
      temporary,
      roll: rollExpected,
      rollSource: FATE_RULES.ROLL_SOURCE,
    });

    await actor.update({
      [`${pathBase}.max`]: max,
      [`${pathBase}.permanent`]: permanent,
      [`${pathBase}.temporary`]: temporary,
      [`${pathBase}.roll`]: rollExpected,
    });

    info("Fate data ensured", { actorId: actor?.id });
  } catch (err) {
    error("Failed to ensure fate data", err);
  }
}
