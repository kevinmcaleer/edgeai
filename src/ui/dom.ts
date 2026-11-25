import { ICONS } from "./icons";

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

/** Creates an element. Attributes starting with "on" become listeners; true booleans become empty attributes. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

/** A line icon as an SVG element, drawn in currentColor. */
export function icon(name: string, size = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "ea-icon");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", ICONS[name] ?? ICONS.more);
  svg.append(path);
  return svg;
}

export interface ButtonOpts {
  icon?: string;
  label?: string;
  title?: string;
  kind?: "done" | "cancel" | "stale" | "danger";
  on?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
}

/** The design system's button: plain, pressed, or one of its kinds. */
export function button(o: ButtonOpts): HTMLButtonElement {
  const cls = "ea-btn" + (o.on ? " ea-on" : "") + (o.kind ? " ea-" + o.kind : "");
  const b = h("button", { type: "button", class: cls, title: o.title, disabled: o.disabled, "aria-pressed": o.on ? "true" : null, "aria-label": !o.label ? o.title : null });
  if (o.icon) b.append(icon(o.icon, 16));
  if (o.label) b.append(h("span", {}, o.label));
  if (o.onClick) b.addEventListener("click", o.onClick as EventListener);
  return b;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

export function plural(n: number, one: string, many = one + "s"): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
