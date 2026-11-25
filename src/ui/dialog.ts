import { button, h, icon } from "./dom";

export interface DialogOpts {
  title: string;
  icon: string;
  body: Node[];
  /** The one filled action. Return false to keep the dialog open. */
  action: { label: string; icon?: string; danger?: boolean; run: () => unknown | Promise<unknown> };
  wide?: boolean;
}

/** A modal over a scrim, for decisions that must come first. Esc or Cancel closes it. */
export function openDialog(o: DialogOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const close = (ok: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      scrim.remove();
      prevFocus?.focus?.();
      resolve(ok);
    };
    const act = async () => {
      actBtn.disabled = true;
      try {
        const r = await o.action.run();
        if (r === false) {
          actBtn.disabled = false;
          return;
        }
        close(true);
      } catch (err) {
        actBtn.disabled = false;
        error.textContent = err instanceof Error ? err.message : String(err);
        error.hidden = false;
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      } else if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        void act();
      }
    };
    const error = h("p", { class: "ea-note", style: "color:var(--danger);margin:0", hidden: true, role: "alert" });
    const actBtn = h("button", { type: "button", class: "ea-btn ea-done" + (o.action.danger ? " ea-danger" : "") });
    if (o.action.icon) actBtn.append(icon(o.action.icon, 16));
    actBtn.append(h("span", {}, o.action.label));
    actBtn.addEventListener("click", () => void act());
    const closeBtn = h("button", { type: "button", class: "ea-icon-btn", title: "Close (Esc)", "aria-label": "Close" }, icon("close", 16));
    closeBtn.addEventListener("click", () => close(false));
    const dialog = h(
      "div",
      { class: "ea-dialog" + (o.wide ? " ea-wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": o.title },
      h("div", { class: "ea-dialog-head" }, icon(o.icon, 16), h("span", { class: "ea-grow" }, o.title), closeBtn),
      h("div", { class: "ea-dialog-body" }, ...o.body, error),
      h("div", { class: "ea-dialog-foot" }, button({ label: "Cancel", kind: "cancel", onClick: () => close(false) }), actBtn),
    );
    const scrim = h("div", { class: "ea-scrim ea-scrim-fixed" }, dialog);
    scrim.addEventListener("mousedown", (e) => {
      if (e.target === scrim) close(false);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim);
    const first = dialog.querySelector<HTMLElement>("input, select, textarea") ?? actBtn;
    first.focus();
  });
}
