import { button, h, icon } from "../ui/dom";
import { bindStatus, live } from "../ui/toast";
import type { Project } from "../types";

export type Workspace = "data" | "label" | "train" | "test" | "deploy";

export const WORKSPACES: { id: Workspace; icon: string; label: string; step?: number }[] = [
  { id: "data", icon: "dataset", label: "Data" },
  { id: "label", icon: "box", label: "Label", step: 2 },
  { id: "train", icon: "train", label: "Train", step: 3 },
  { id: "test", icon: "test", label: "Test", step: 3 },
  { id: "deploy", icon: "deploy", label: "Deploy", step: 3 },
];

const THEME_KEY = "edgeai.theme";

export function applySavedTheme(): void {
  let t: string | null = null;
  try {
    t = localStorage.getItem(THEME_KEY);
  } catch {
    /* storage blocked: follow the system */
  }
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
}

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t) return t === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function themeButton(): HTMLButtonElement {
  const b = button({ icon: isDark() ? "sun" : "moon", title: isDark() ? "Light theme" : "Dark theme" });
  b.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not saved; fine for this visit */
    }
    b.replaceWith(themeButton());
  });
  return b;
}

/** The top bar, workspace rail and body frame around a workspace. Returns the body to fill. */
export function shell(root: HTMLElement, project: Project, current: Workspace, badges: Partial<Record<Workspace, string>> = {}): HTMLElement {
  const status = live();
  bindStatus(status);
  const projectBtn = h("a", { class: "ea-btn ea-project", href: "#", title: "All projects" }, project.name, icon("prev", 14));
  projectBtn.querySelector("svg:last-child")?.classList.add("ea-caret");
  const top = h(
    "header",
    { class: "ea-top" },
    h("a", { class: "ea-title", href: "#", title: "All projects" }, icon("target", 18), "EdgeAI"),
    h("span", { class: "ea-sep" }),
    projectBtn,
    status,
    h("span", { class: "ea-grow" }),
    themeButton(),
    h("span", { class: "ea-sep" }),
    button({ icon: "download", label: "Export", kind: "done", disabled: true, title: "Export arrives with training (step 3)" }),
  );
  const rail = h(
    "nav",
    { class: "ea-rail", "aria-label": "Workspaces" },
    ...WORKSPACES.map((w) =>
      h(
        "a",
        { class: "ea-rail-btn", href: `#p/${project.id}/${w.id}`, "aria-pressed": String(w.id === current), "aria-current": w.id === current ? "page" : null },
        icon(w.icon, 20),
        h("span", {}, w.label),
        badges[w.id] ? h("b", { class: "ea-rail-badge" }, badges[w.id]!) : null,
      ),
    ),
  );
  const body = h("div", { class: "ea-body" }, rail);
  root.replaceChildren(h("div", { class: "ea-app" }, top, body));
  return body;
}
