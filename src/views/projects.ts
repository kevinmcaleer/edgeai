import { createProject, deleteProject, listImages, listProjects, renameProject } from "../db";
import { button, h, icon, plural } from "../ui/dom";
import { openDialog } from "../ui/dialog";
import type { Project, ProjectKind } from "../types";
import { themeButton } from "./shell";

const urls: string[] = [];

export function ago(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.round(hr / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export async function newProjectDialog(): Promise<Project | null> {
  let created: Project | null = null;
  const name = h("input", { class: "ea-text", id: "np-name", value: "", placeholder: "Line follower parts", autocomplete: "off" });
  let kind: ProjectKind = "detect";
  const choice = (k: ProjectKind, ic: string, title: string, text: string) => {
    const b = h("button", { type: "button", class: "ea-choice" + (k === kind ? " ea-on" : ""), "aria-pressed": String(k === kind) }, icon(ic, 20), h("strong", {}, title), h("span", {}, text));
    b.addEventListener("click", () => {
      kind = k;
      for (const el of choices.children) {
        el.classList.toggle("ea-on", el === b);
        el.setAttribute("aria-pressed", String(el === b));
      }
    });
    return b;
  };
  const choices = h(
    "div",
    { class: "ea-choices ea-choices-2" },
    choice("detect", "box", "Find objects", "Draw boxes round each thing. Tells you what and where."),
    choice("classify", "tag", "Name the picture", "One class per picture. Quicker to label."),
  );
  await openDialog({
    title: "New project",
    icon: "plus",
    body: [
      h("label", { class: "ea-namebox", for: "np-name" }, "Name", name),
      h("div", {}, h("div", { class: "ea-sub", style: "margin-top:0" }, "What should it do?"), choices),
    ],
    action: {
      label: "Create project",
      run: async () => {
        created = await createProject(name.value || "Untitled project", kind);
      },
    },
  });
  return created;
}

async function card(p: Project, refresh: () => void): Promise<HTMLElement> {
  const imgs = await listImages(p.id);
  const thumb = h("span", { class: "ea-tile-img" });
  if (imgs[0]) {
    const u = URL.createObjectURL(imgs[0].thumb);
    urls.push(u);
    thumb.append(h("img", { src: u, alt: "", class: "ea-thumb-img" }));
  } else {
    thumb.append(h("span", { class: "ea-thumb-empty" }, icon("image", 28)));
  }
  const more = h("button", { type: "button", class: "ea-icon-btn ea-card-more", title: "Rename or delete", "aria-label": `Rename or delete ${p.name}` }, icon("more", 16));
  more.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    projectMenu(more, p, refresh);
  });
  return h(
    "a",
    { class: "ea-tile ea-project-card", href: `#p/${p.id}/data` },
    thumb,
    h("span", { class: "ea-card-row" }, h("strong", {}, p.name), more),
    h("span", { class: "ea-tile-name" }, `${plural(imgs.length, "picture")} · ${p.kind === "detect" ? "find objects" : "name the picture"} · ${ago(p.updatedAt)}`),
  );
}

function projectMenu(anchor: HTMLElement, p: Project, refresh: () => void): void {
  document.querySelector(".ea-menu.ea-floating")?.remove();
  const r = anchor.getBoundingClientRect();
  const item = (ic: string, label: string, run: () => void, cls = "") => {
    const b = h("button", { type: "button", class: "ea-menu-item " + cls, role: "menuitem" }, icon(ic, 16), h("span", {}, label));
    b.addEventListener("click", () => {
      menu.remove();
      run();
    });
    return b;
  };
  const menu = h(
    "div",
    { class: "ea-menu ea-floating", role: "menu", style: `position:fixed;top:${r.bottom + 4}px;left:${Math.max(8, r.right - 220)}px;width:220px;z-index:30` },
    item("pencil", "Rename…", () => void renameDialog(p).then(refresh)),
    h("hr"),
    item("trash", "Delete project…", () => void deleteDialog(p).then(refresh), "ea-danger"),
  );
  document.body.append(menu);
  setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }));
}

async function renameDialog(p: Project): Promise<void> {
  const input = h("input", { class: "ea-text", id: "rn-name", value: p.name, autocomplete: "off" });
  await openDialog({ title: "Rename project", icon: "pencil", body: [h("label", { class: "ea-namebox", for: "rn-name" }, "Name", input)], action: { label: "Rename", run: () => renameProject(p.id, input.value) } });
}

async function deleteDialog(p: Project): Promise<void> {
  const n = (await listImages(p.id)).length;
  await openDialog({
    title: `Delete ${p.name}`,
    icon: "trash",
    body: [h("p", { class: "ea-note" }, `The project and its ${plural(n, "picture")} will be removed from this browser. This cannot be undone.`)],
    action: { label: "Delete", icon: "trash", danger: true, run: () => deleteProject(p.id) },
  });
}

export async function projectsView(root: HTMLElement): Promise<void> {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  const refresh = () => void projectsView(root);
  const projects = await listProjects();
  const newBtn = button({ icon: "plus", label: "New project", kind: "done", title: "Start a new project (N)" });
  newBtn.addEventListener("click", async () => {
    const p = await newProjectDialog();
    if (p) location.hash = `p/${p.id}/data`;
  });
  const cards = await Promise.all(projects.map((p) => card(p, refresh)));
  const startCard = h("button", { type: "button", class: "ea-drop ea-start" }, h("span", { style: "color:var(--accent)" }, icon("plus", 24)), h("strong", {}, "New project"), "Name it, then add pictures from a camera or your files.");
  startCard.addEventListener("click", () => newBtn.click());
  root.replaceChildren(
    h(
      "div",
      { class: "ea-app" },
      h("header", { class: "ea-top" }, h("a", { class: "ea-title", href: "#" }, icon("target", 18), "EdgeAI"), h("span", { class: "ea-grow" }), themeButton()),
      h(
        "main",
        { class: "ea-page" },
        h(
          "div",
          { class: "ea-page-inner" },
          h(
            "div",
            { class: "ea-page-head" },
            h("div", {}, h("h1", { class: "ea-page-title" }, "Projects"), h("p", { class: "ea-page-body" }, "Capture pictures, draw boxes round what matters, train a model and run it on your robot. Everything stays in this browser.")),
            newBtn,
          ),
          h("div", { class: "ea-grid ea-project-grid" }, ...cards, startCard),
          h(
            "div",
            { class: "ea-card ea-pi-card" },
            h("span", { style: "color:var(--accent)" }, icon("chip", 24)),
            h("div", { style: "flex:1;min-width:220px" }, h("strong", {}, "Capture from a Raspberry Pi"), h("div", { class: "ea-hint" }, "Run edgeai_stream.py on the Pi to share its camera with this page. Works with Camera Module 3, the AI Camera and USB webcams.")),
            h("a", { class: "ea-btn", href: "https://github.com/kevinmcaleer/edgeai/tree/main/pi", target: "_blank", rel: "noopener" }, icon("code", 16), h("span", {}, "How to set it up")),
          ),
        ),
      ),
    ),
  );
}
