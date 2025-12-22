/**
 * Replace vanilla result lines completely with a single outcome line.
 *
 * Visual styling rules:
 * - Keep "danger" class for botch
 * - Keep "success" class for success
 * - Failure has no special class
 */
export function replaceOutcomeLine(successAreaEl, out, outText) {
  // Replace vanilla lines completely.
  // Keep "danger" styling for botch, and "success" styling for success (via existing classes).
  successAreaEl.textContent = "";

  const line = document.createElement("div");
  const span = document.createElement("span");

  if (out?.kind === "botch") {
    span.classList.add("danger");
  } else if (out?.kind === "success") {
    span.classList.add("success");
  }

  span.textContent = outText;
  line.appendChild(span);
  successAreaEl.appendChild(line);
}
