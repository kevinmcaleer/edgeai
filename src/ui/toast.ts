import { h } from "./dom";

let statusEl: HTMLElement | null = null;
let timer = 0;

export function bindStatus(el: HTMLElement): void {
  statusEl = el;
}

/** Shows a line in the top bar's status. Plain messages clear after 5 s; errors stay until replaced. */
export function setStatus(text: string, kind: "plain" | "busy" | "bad" = "plain"): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = "ea-status" + (kind !== "plain" ? " ea-" + kind : "");
  window.clearTimeout(timer);
  if (kind === "plain") timer = window.setTimeout(() => statusEl && (statusEl.textContent = "Saved in this browser"), 5000);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const live = (): HTMLElement => h("span", { class: "ea-status", role: "status", "aria-live": "polite" }, "Saved in this browser");
