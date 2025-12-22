/**
 * Replace vanilla result lines completely with a single outcome line.
 *
 * Visual rules:
 * - botch => danger class
 * - success => success class
 * - failure => no special class
 */
export function replaceOutcomeLine(successAreaEl, outcome, outcomeText) {
  successAreaEl.textContent = "";

  const line = document.createElement("div");
  const span = document.createElement("span");

  if (outcome?.kind === "botch") {
    span.classList.add("danger");
  } else if (outcome?.kind === "success") {
    span.classList.add("success");
  }

  span.textContent = outcomeText;
  line.appendChild(span);
  successAreaEl.appendChild(line);
}
