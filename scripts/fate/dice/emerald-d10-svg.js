import { debugNs } from "../../logger/ns.js";

const { debug } = debugNs("fate:dice:emerald");

/**
 * Generate an xD10 SVG identical in geometry to the system IconsHelper._getxD10,
 * but with custom styling:
 * - Emerald faces
 * - Gold digits
 * - Black edges
 *
 * We intentionally keep this generator self-contained so we don't need to patch
 * or depend on internal system helper APIs.
 */

// Visual palette (tweak here if needed)
const EMERALD_FACE = "#0E7A5C";
const EDGE_STROKE = "#000000";
const DIGIT_GOLD = "#D4AF37";
const DIGIT_STROKE = "#000000";

/**
 * @param {number} value 1..10
 * @param {{ height?: number, width?: number }} [opts]
 * @returns {string} raw SVG markup (NOT url-encoded)
 */
export function buildEmeraldD10Svg(value, opts = {}) {
  const height = Number(opts.height ?? 30) || 30;
  const width = Number(opts.width ?? 30) || 30;

  const v = clampD10Value(value);

  // NOTE: Geometry copied from Foundry_WoD20/module/scripts/icons.js :: IconsHelper._getxD10
  // and only styling was changed.
  const svg = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 64 64" style="enable-background:new 0 0 64 64; height: ${height}px; width: ${width}px;" xml:space="preserve">
  <g>
    <g transform="matrix(1.1679092,0,0,1.1679092,-274.931,-137.53749)" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}">
      <path d="M263.4,124.6L249.9,153l12.5,8.1l13.5-8.2L263.4,124.6z" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}" />
      <path d="M264.1,124.1l12.5,28.6l7.3-2.3l0.5-11.6L264.1,124.1z" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}" />
      <path d="M262.7,161.8v4.4l20.9-14.7l-7,2L262.7,161.8z" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}" />
      <path d="M262.7,124.2l-13.7,28.5l-7.1-3.1l-0.6-11.6L262.7,124.2z" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}" />
      <path d="M261.8,161.7v4.5l-20-15.4l6.9,2.7L261.8,161.7z" fill="${EMERALD_FACE}" stroke="${EDGE_STROKE}" />
    </g>
  </g>
  <text class="dice_roll" x="32" y="36" fill="${DIGIT_GOLD}" stroke="${DIGIT_STROKE}" stroke-width="0.8" paint-order="stroke" font-size="25" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${v}</text>
</svg>`;

  debug("Built emerald D10 SVG", { value: v, height, width });
  return svg;
}

function clampD10Value(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 10) return 10;
  return n;
}
