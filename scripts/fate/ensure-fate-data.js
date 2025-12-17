import { debugNs } from "../logger/ns.js";
import { FATE_RULES } from "../constants/fate-rules.js";
import { FATE_DATA } from "../constants/fate-data.js";

const { debug, info, error } = debugNs("fate:data");

function clampInt(value, min, max) {
  const v = Number.isFinite(Number(value)) ? parseInt(value, 10) : min;
  return Math.min(max, Math.max(min, v));
}

export async function ensureFateData(actor) {
  try {
    const pathBase = FATE_DATA.PATH_BASE_SYSTEM;
    const existing = actor?.system?.advantages?.fate;

    if (!existing) {
      info("Initializing fate data for actor", { actorId: actor?.id, actorName: actor?.name });

      const defaults = {
        ...FATE_RULES.DEFAULTS,
        label: "rusbar.homerules.fate.label",
      };

      defaults.max = clampInt(defaults.max, 1, FATE_RULES.MAX_CAP);
      defaults.permanent = clampInt(defaults.permanent, 0, defaults.max);
      defaults.temporary = clampInt(defaults.temporary, 0, defaults.permanent);
      defaults.roll = clampInt(defaults.roll, 0, defaults.max);

      await actor.update({ [`${pathBase}`]: defaults });
      return;
    }

    const max = clampInt(existing.max, 1, FATE_RULES.MAX_CAP);
    const permanent = clampInt(existing.permanent, 0, max);
    const temporary = clampInt(existing.temporary, 0, permanent);
    const roll = clampInt(existing.roll ?? permanent, 0, max);
    const label =
      typeof existing.label === "string" && existing.label.length > 0
        ? existing.label
        : "rusbar.homerules.fate.label";

    const needsUpdate =
      max !== existing.max ||
      permanent !== existing.permanent ||
      temporary !== existing.temporary ||
      roll !== existing.roll ||
      label !== existing.label;

    debug("Fate data check", { actorId: actor?.id, max, permanent, temporary, roll, label, needsUpdate });

    if (!needsUpdate) return;

    await actor.update({
      [`${pathBase}.max`]: max,
      [`${pathBase}.permanent`]: permanent,
      [`${pathBase}.temporary`]: temporary,
      [`${pathBase}.roll`]: roll,
      [`${pathBase}.label`]: label,
    });
  } catch (err) {
    error("Failed to ensure fate data", err);
  }
}
