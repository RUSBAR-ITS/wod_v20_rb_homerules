import { debugNs } from "../../logger/ns.js";

const { debug, warn } = debugNs("fate:dice:emerald");

/**
 * Generate a data-uri for an "emerald Fate" d10.
 *
 * Requirements:
 * - Emerald facets (fill)
 * - Gold digits
 * - Black edges
 *
 * System convention: 10 is rendered as 0 on the face.
 *
 * @param {number} value Die result value (1..10)
 * @param {{height?: number, width?: number}} [opts]
 * @returns {string} data:image/svg+xml;utf8,<ENCODED_SVG>
 */
export function getEmeraldFateD10DataUri(value, opts = {}) {
  const height = Number.isFinite(opts.height) ? opts.height : 30;
  const width = Number.isFinite(opts.width) ? opts.width : 30;

  const number = value === 10 ? 0 : value;
  if (!Number.isFinite(number) || number < 0 || number > 10) {
    warn("Invalid d10 value; cannot generate emerald Fate die", { value });
    return "";
  }

  const key = `${number}:${height}:${width}`;
  if (!getEmeraldFateD10DataUri._cache) getEmeraldFateD10DataUri._cache = new Map();
  const cache = getEmeraldFateD10DataUri._cache;
  if (cache.has(key)) return cache.get(key);

  const emerald = "#00a86b";
  const gold = "#d4af37";
  const stroke = "#000";

  // Geometry matches the system d10 SVG style (forked and recolored).
  const svg = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 64 64" style="enable-background:new 0 0 64 64; height: ${height}px; width: ${width}px;" xml:space="preserve">
  <g>
    <g transform="matrix(1.1679092,0,0,1.1679092,-274.931,-137.53749)" fill="${emerald}" stroke="${stroke}">
      <path d="M263.4,124.6L249.9,153l12.5,8.1l13.5-8.2L263.4,124.6z" fill="${emerald}" stroke="${stroke}" />
      <path d="M264.1,124.1l12.5,28.6l7.3-2.3l0.5-11.6L264.1,124.1z" fill="${emerald}" stroke="${stroke}" />
      <path d="M262.7,161.8v4.4l20.9-14.7l-7,2L262.7,161.8z" fill="${emerald}" stroke="${stroke}" />
      <path d="M262.7,124.2l-13.7,28.5l-7.1-3.1l-0.6-11.6L262.7,124.2z" fill="${emerald}" stroke="${stroke}" />
      <path d="M261.8,161.7v4.5l-20-15.4l6.9,2.7L261.8,161.7z" fill="${emerald}" stroke="${stroke}" />
    </g>
  </g>
  <text class="dice_roll" x="32" y="36" fill="${gold}" font-size="25" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${number}</text>
</svg>`;

  const uri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  cache.set(key, uri);

  debug("Generated emerald Fate d10 data-uri", { number, height, width });

  return uri;
}
