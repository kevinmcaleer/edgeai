// The Data workspace: every picture in the project, and the ways to add more.
import { deleteImages, listImages, updateImages } from "../db";
import { encodeBlob, encodeVideoFrame, captureName } from "../imaging";
import { addEncoded, importFiles, type SplitChoice } from "../library";
import { cameraSupported, listCameras, openCamera, stopStream } from "../capture/local";
import { normalisePiUrl, piInfo, piSnapshot, piStreamUrl } from "../capture/pi";
import { button, h, icon, plural } from "../ui/dom";
import { openDialog } from "../ui/dialog";
import { errorText, setStatus } from "../ui/toast";
import type { ImageSummary, Project, Source } from "../types";

type Filter = "all" | "unlabelled" | "train" | "test";
type SourceTab = "camera" | "pi" | "upload";

const PREFS_KEY = "edgeai.capture";
interface Prefs {
  source: SourceTab;
  piUrl: string;
  deviceId: string;
  split: SplitChoice;
}

function loadPrefs(): Prefs {
  const d: Prefs = { source: "camera", piUrl: "", deviceId: "", split: "auto" };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return d;
  }
}
function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* not saved */
  }
}

/** Tidy-up for the current view: stops cameras and frees thumbnail URLs when leaving. */
let teardown: (() => void) | null = null;
export function leaveData(): void {
  teardown?.();
  teardown = null;
}

const BURST_COUNT = 10;
const BURST_GAP_MS = 500;

export async function dataView(body: HTMLElement, project: Project, onCounts: (unlabelled: number) => void): Promise<void> {
  leaveData();
  const prefs = loadPrefs();
  let images: ImageSummary[] = [];
  let filter: Filter = "all";
  const selected = new Set<string>();
  let lastClicked: string | null = null;
  const thumbUrls = new Map<string, string>();
  let stream: MediaStream | null = null;
  let piBase: string | null = null;
  let busy = false;

  // ---------- left: filters
  const filterList = h("ul", { class: "ea-classes" });
  const splitBar = h("div", { class: "ea-progress" }, h("i", { style: "width:0%" }));
  const splitNote = h("p", { class: "ea-note" });
  const left = h(
    "aside",
    { class: "ea-side" },
    h("div", { class: "ea-panel-title" }, "Pictures", h("span", { class: "ea-hint", id: "count-all" })),
    filterList,
    h("div", { class: "ea-panel-title" }, "Split"),
    splitBar,
    splitNote,
    h("p", { class: "ea-note" }, "Classes and boxes arrive with the Label workspace."),
  );

  // ---------- middle: selection bar and grid
  const selBar = h("div", { class: "ea-tools ea-selbar", role: "toolbar", "aria-label": "Selected pictures" });
  const grid = h("div", { class: "ea-grid", role: "listbox", "aria-multiselectable": "true", "aria-label": "Pictures" });
  const empty = h(
    "div",
    { class: "ea-drop ea-grid-empty" },
    h("span", { style: "color:var(--accent)" }, icon("image", 28)),
    h("strong", {}, "No pictures yet"),
    "Drop pictures here, choose Upload, or capture from a camera on the right.",
  );
  const dropHint = h("div", { class: "ea-drop ea-over ea-drop-overlay", hidden: true }, icon("upload", 24), h("strong", {}, "Drop to add these pictures"));
  const stage = h(
    "main",
    { class: "ea-stage ea-data-stage", tabindex: "-1" },
    h("div", { class: "ea-stage-head" }, selBar, h("span", { class: "ea-grow" }), h("span", { class: "ea-hint" }, "Newest first")),
    grid,
    empty,
    dropHint,
  );

  // ---------- right: sources
  const sourceList = h("div", { class: "ea-sources", role: "radiogroup", "aria-label": "Where pictures come from" });
  const sourcePanel = h("div", { class: "ea-source-panel" });
  const splitSel = h(
    "select",
    { class: "ea-select", id: "cap-split" },
    h("option", { value: "auto" }, "Auto (80 / 20)"),
    h("option", { value: "train" }, "Train"),
    h("option", { value: "test" }, "Test"),
  );
  splitSel.value = prefs.split;
  splitSel.addEventListener("change", () => {
    prefs.split = splitSel.value as SplitChoice;
    savePrefs(prefs);
  });
  const right = h(
    "aside",
    { class: "ea-side ea-right" },
    h("div", { class: "ea-panel-title" }, "Add pictures"),
    sourceList,
    sourcePanel,
    h("label", { class: "ea-namebox", for: "cap-split", style: "margin-top:12px" }, "New pictures go to", splitSel),
  );

  body.append(left, stage, right);

  // ---------- data
  async function reload(): Promise<void> {
    images = await listImages(project.id);
    for (const id of [...selected]) if (!images.some((i) => i.id === id)) selected.delete(id);
    for (const [id, u] of thumbUrls) {
      if (!images.some((i) => i.id === id)) {
        URL.revokeObjectURL(u);
        thumbUrls.delete(id);
      }
    }
    render();
  }

  function visible(): ImageSummary[] {
    switch (filter) {
      case "train":
        return images.filter((i) => i.split === "train");
      case "test":
        return images.filter((i) => i.split === "test");
      case "unlabelled":
        return images.filter((i) => i.boxes.length === 0);
      default:
        return images;
    }
  }

  function thumbUrl(img: ImageSummary): string {
    let u = thumbUrls.get(img.id);
    if (!u) {
      u = URL.createObjectURL(img.thumb);
      thumbUrls.set(img.id, u);
    }
    return u;
  }

  function render(): void {
    const train = images.filter((i) => i.split === "train").length;
    const test = images.length - train;
    const unlabelled = images.filter((i) => i.boxes.length === 0).length;
    onCounts(unlabelled);
    (left.querySelector("#count-all") as HTMLElement).textContent = images.length.toLocaleString();

    const rows: [Filter, string, string, number][] = [
      ["all", "dataset", "All", images.length],
      ["unlabelled", "warning", "No boxes yet", unlabelled],
      ["train", "train", "Train", train],
      ["test", "test", "Test", test],
    ];
    filterList.replaceChildren(
      ...rows.map(([f, ic, label, n]) => {
        const b = h("button", { type: "button", class: "ea-class-name", "aria-pressed": String(filter === f) }, icon(ic, 16), h("span", {}, label), h("em", {}, n.toLocaleString()));
        b.addEventListener("click", () => {
          filter = f;
          render();
        });
        return h("li", { class: "ea-class" + (filter === f ? " ea-on" : "") }, b);
      }),
    );
    const share = images.length ? Math.round((train / images.length) * 100) : 80;
    (splitBar.firstChild as HTMLElement).style.width = share + "%";
    splitNote.textContent = images.length ? `${share}% train, ${100 - share}% test. Test pictures are kept back to check the model.` : "New pictures are split 80 / 20 for you.";

    // selection bar
    const n = selected.size;
    selBar.replaceChildren(
      n
        ? button({ label: `${n} selected`, on: true, title: "Clear the selection (Esc)", onClick: () => { selected.clear(); render(); } })
        : button({ icon: "check", label: "Select all", title: "Select all (Ctrl+A)", disabled: !visible().length, onClick: () => { visible().forEach((i) => selected.add(i.id)); render(); } }),
      button({ icon: "train", label: "Move to Train", disabled: !n, title: "Move the selection to Train", onClick: () => void moveTo("train") }),
      button({ icon: "test", label: "Move to Test", disabled: !n, title: "Move the selection to Test (T)", onClick: () => void moveTo("test") }),
      button({ icon: "trash", title: "Delete the selection (Del)", disabled: !n, onClick: () => void confirmDelete() }),
    );

    // grid
    const list = visible();
    empty.hidden = list.length > 0;
    if (!images.length) {
      empty.querySelector("strong")!.textContent = "No pictures yet";
    } else if (!list.length) {
      empty.querySelector("strong")!.textContent = "Nothing matches this filter";
    }
    grid.hidden = !list.length;
    grid.replaceChildren(
      ...list.map((img) => {
        const on = selected.has(img.id);
        const tile = h(
          "button",
          { type: "button", class: "ea-tile" + (on ? " ea-on" : ""), role: "option", "aria-selected": String(on), "data-id": img.id, title: `${img.name} · ${img.width} × ${img.height} px` },
          h(
            "span",
            { class: "ea-tile-img" },
            h("img", { src: thumbUrl(img), alt: img.name, loading: "lazy", class: "ea-thumb-img" }),
            img.boxes.length ? null : h("b", { class: "ea-tag ea-tag-warn" }, "No boxes"),
            h("b", { class: "ea-tag ea-split" }, img.split === "train" ? "Train" : "Test"),
          ),
          h("span", { class: "ea-tile-name" }, img.name),
        );
        tile.addEventListener("click", (e) => clickTile(img.id, e));
        return tile;
      }),
    );
  }

  function clickTile(id: string, e: MouseEvent): void {
    const list = visible();
    if (e.shiftKey && lastClicked) {
      const a = list.findIndex((i) => i.id === lastClicked);
      const b = list.findIndex((i) => i.id === id);
      if (a >= 0 && b >= 0) for (let k = Math.min(a, b); k <= Math.max(a, b); k++) selected.add(list[k].id);
    } else if (e.ctrlKey || e.metaKey) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
    } else {
      const only = selected.size === 1 && selected.has(id);
      selected.clear();
      if (!only) selected.add(id);
    }
    lastClicked = id;
    render();
    grid.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
  }

  async function moveTo(split: "train" | "test"): Promise<void> {
    const ids = [...selected];
    await updateImages(ids, { split });
    setStatus(`Moved ${plural(ids.length, "picture")} to ${split === "train" ? "Train" : "Test"}`);
    await reload();
  }

  async function confirmDelete(): Promise<void> {
    const ids = [...selected];
    if (!ids.length) return;
    const names = images.filter((i) => selected.has(i.id)).map((i) => i.name);
    const list = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
    const ok = await openDialog({
      title: `Delete ${plural(ids.length, "picture")}`,
      icon: "trash",
      body: [h("p", { class: "ea-note" }, `${list} will be removed from this project. This cannot be undone.`)],
      action: { label: "Delete", icon: "trash", danger: true, run: () => deleteImages(ids) },
    });
    if (ok) {
      selected.clear();
      setStatus(`Deleted ${plural(ids.length, "picture")}`);
      await reload();
    }
  }

  // ---------- adding pictures
  async function addFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    setStatus(`Adding ${plural(files.length, "picture")}…`, "busy");
    try {
      const res = await importFiles(project.id, files, prefs.split, (d, t) => setStatus(`Adding pictures · ${d} of ${t}`, "busy"));
      await reload();
      if (res.skipped.length)
        setStatus(`Added ${plural(res.added, "picture")}. Skipped ${res.skipped.length} that ${res.skipped.length === 1 ? "is not a picture" : "are not pictures"}: ${res.skipped.slice(0, 3).join(", ")}`, "bad");
      else setStatus(`Added ${plural(res.added, "picture")}`);
    } catch (err) {
      setStatus(errorText(err), "bad");
    }
  }

  async function storeCapture(blobOrVideo: Blob | HTMLVideoElement, source: Source, n?: number): Promise<void> {
    const encoded = blobOrVideo instanceof Blob ? await encodeBlob(blobOrVideo) : await encodeVideoFrame(blobOrVideo);
    await addEncoded(project.id, [{ encoded, name: captureName(source === "pi" ? "pi" : "cam", new Date(), n) }], source, prefs.split);
  }

  let captureOnce: (() => Promise<void>) | null = null;

  async function capture(burst: boolean): Promise<void> {
    if (!captureOnce || busy) return;
    busy = true;
    flash();
    try {
      if (!burst) {
        await captureOnce();
        await reload();
        setStatus("Captured 1 picture");
      } else {
        for (let i = 0; i < BURST_COUNT; i++) {
          setStatus(`Burst · ${i + 1} of ${BURST_COUNT}`, "busy");
          await captureOnce();
          await reload();
          if (i < BURST_COUNT - 1) await new Promise((r) => setTimeout(r, BURST_GAP_MS));
        }
        setStatus(`Captured ${BURST_COUNT} pictures`);
      }
    } catch (err) {
      setStatus(errorText(err), "bad");
    } finally {
      busy = false;
    }
  }

  function flash(): void {
    const f = sourcePanel.querySelector<HTMLElement>(".ea-camera");
    if (!f) return;
    f.classList.remove("ea-flash");
    void f.offsetWidth;
    f.classList.add("ea-flash");
  }

  function captureButtons(enabled: boolean): HTMLElement {
    return h(
      "div",
      { class: "ea-capture-row" },
      button({ icon: "camera", label: "Capture", kind: "done", title: "Capture (Space)", disabled: !enabled, onClick: () => void capture(false) }),
      button({ icon: "burst", label: "Burst", title: `Take ${BURST_COUNT} pictures, one every half second (Shift+Space)`, disabled: !enabled, onClick: () => void capture(true) }),
    );
  }

  function stopCamera(): void {
    stopStream(stream);
    stream = null;
    piBase = null;
    captureOnce = null;
  }

  function renderSources(): void {
    const opts: [SourceTab, string, string, string][] = [
      ["camera", "usb", "This computer's camera", cameraSupported() ? "A webcam, laptop camera, or a Pi camera in the Pi's own browser" : "Not available in this browser"],
      ["pi", "wifi", "Raspberry Pi camera", "A Pi on your network running edgeai_stream.py"],
      ["upload", "upload", "Upload pictures", "JPEG, PNG or WebP, or drop them on the grid"],
    ];
    sourceList.replaceChildren(
      ...opts.map(([id, ic, title, sub]) => {
        const b = h("button", { type: "button", class: "ea-source" + (prefs.source === id ? " ea-on" : ""), role: "radio", "aria-checked": String(prefs.source === id) }, icon(ic, 16), h("span", {}, title, h("small", {}, sub)));
        b.addEventListener("click", () => {
          if (prefs.source === id) return;
          prefs.source = id;
          savePrefs(prefs);
          stopCamera();
          renderSources();
        });
        return b;
      }),
    );
    if (prefs.source === "camera") void renderCamera();
    else if (prefs.source === "pi") renderPi();
    else renderUpload();
  }

  function renderUpload(): void {
    const input = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, id: "upload-input" });
    input.addEventListener("change", () => {
      void addFiles([...(input.files ?? [])]);
      input.value = "";
    });
    const pick = h("button", { type: "button", class: "ea-wide-btn ea-primary" }, icon("upload", 16), "Choose pictures");
    pick.addEventListener("click", () => input.click());
    sourcePanel.replaceChildren(input, pick, h("p", { class: "ea-note" }, "Pictures are scaled so their long side is at most 1280 px and kept in this browser. Nothing is uploaded to a server."));
  }

  async function renderCamera(): Promise<void> {
    const video = h("video", { autoplay: true, muted: true, playsinline: true, class: "ea-video" });
    const frame = h("div", { class: "ea-camera" }, video, h("span", { class: "ea-live", hidden: true }, "Live"));
    const sel = h("select", { class: "ea-select", id: "cam-device", "aria-label": "Camera" });
    const err = h("div", { class: "ea-banner ea-bad", hidden: true, role: "alert" });
    const startBtn = h("button", { type: "button", class: "ea-wide-btn ea-primary" }, icon("camera", 16), "Start the camera");
    const controls = h("div", {});
    sourcePanel.replaceChildren(err, frame, h("label", { class: "ea-namebox", for: "cam-device", style: "margin-top:12px" }, "Camera", sel), controls);
    if (!cameraSupported()) {
      err.hidden = false;
      err.replaceChildren(h("p", {}, "This browser cannot use a camera here. Cameras need https or localhost; try Chrome, Edge or Firefox."));
      frame.hidden = true;
      return;
    }
    const fillDevices = async () => {
      const cams = await listCameras();
      sel.replaceChildren(...(cams.length ? cams.map((c) => h("option", { value: c.deviceId }, c.label)) : [h("option", { value: "" }, "Default camera")]));
      if (prefs.deviceId && cams.some((c) => c.deviceId === prefs.deviceId)) sel.value = prefs.deviceId;
    };
    const start = async () => {
      err.hidden = true;
      stopStream(stream);
      try {
        stream = await openCamera(sel.value || prefs.deviceId || undefined);
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        await fillDevices();
        const track = stream.getVideoTracks()[0];
        const id = track?.getSettings().deviceId;
        if (id) {
          sel.value = id;
          prefs.deviceId = id;
          savePrefs(prefs);
        }
        const liveTag = frame.querySelector<HTMLElement>(".ea-live")!;
        liveTag.hidden = false;
        video.addEventListener("loadedmetadata", () => (liveTag.textContent = `Live · ${video.videoWidth} × ${video.videoHeight}`), { once: true });
        if (video.videoWidth) liveTag.textContent = `Live · ${video.videoWidth} × ${video.videoHeight}`;
        captureOnce = () => storeCapture(video, "camera");
        controls.replaceChildren(captureButtons(true), h("p", { class: "ea-note" }, "Space captures one picture, Shift+Space takes a burst of 10."));
      } catch (e) {
        captureOnce = null;
        err.hidden = false;
        err.replaceChildren(h("p", {}, errorText(e)), button({ icon: "redo", label: "Try again", onClick: () => void start() }));
        controls.replaceChildren(startBtn);
      }
    };
    startBtn.addEventListener("click", () => void start());
    sel.addEventListener("change", () => {
      prefs.deviceId = sel.value;
      savePrefs(prefs);
      if (stream) void start();
    });
    await fillDevices().catch(() => undefined);
    controls.replaceChildren(startBtn, h("p", { class: "ea-note" }, "The browser will ask to use the camera. Pictures stay in this browser."));
  }

  function renderPi(): void {
    const input = h("input", { class: "ea-text", id: "pi-url", value: prefs.piUrl, placeholder: "robot.local:8000", autocomplete: "off", spellcheck: "false" });
    const err = h("div", { class: "ea-banner ea-bad", hidden: true, role: "alert" });
    const okBanner = h("div", { class: "ea-banner ea-ok", hidden: true });
    const frame = h("div", { class: "ea-camera", hidden: true });
    const controls = h("div", {});
    const connectBtn = button({ icon: "wifi", label: "Connect", title: "Connect to the Pi" });
    const help = h(
      "details",
      { class: "ea-details" },
      h("summary", {}, "How to set up the Pi"),
      h("p", { class: "ea-note" }, "Copy pi/edgeai_stream.py from the EdgeAI repo to the Pi, then run:"),
      h("pre", { class: "ea-code" }, "sudo apt install -y python3-picamera2\npython3 edgeai_stream.py"),
      h("p", { class: "ea-note" }, "It prints the address to type here, such as robot.local:8000."),
    );
    const connect = async () => {
      err.hidden = true;
      okBanner.hidden = true;
      frame.hidden = true;
      captureOnce = null;
      controls.replaceChildren();
      let base: string;
      try {
        base = normalisePiUrl(input.value);
      } catch (e) {
        err.hidden = false;
        err.replaceChildren(h("p", {}, errorText(e)));
        return;
      }
      prefs.piUrl = input.value.trim();
      savePrefs(prefs);
      setStatus(`Connecting to ${base}…`, "busy");
      try {
        const info = await piInfo(base);
        piBase = base;
        okBanner.hidden = false;
        okBanner.replaceChildren(h("p", {}, `Connected to ${info.name}. ${info.camera}, ${info.width} × ${info.height} px.`));
        frame.hidden = false;
        frame.replaceChildren(h("img", { src: piStreamUrl(base), alt: "Live view from the Pi", class: "ea-video" }), h("span", { class: "ea-live" }, `Live · ${info.width} × ${info.height}`));
        captureOnce = async () => {
          if (!piBase) throw new Error("Connect to the Pi first.");
          await storeCapture(await piSnapshot(piBase), "pi");
        };
        controls.replaceChildren(captureButtons(true), h("p", { class: "ea-note" }, "Space captures one picture, Shift+Space takes a burst of 10."));
        setStatus(`Connected to ${info.name}`);
      } catch (e) {
        setStatus("Saved in this browser");
        err.hidden = false;
        err.replaceChildren(h("p", {}, errorText(e)), button({ icon: "redo", label: "Try again", onClick: () => void connect() }));
      }
    };
    connectBtn.addEventListener("click", () => void connect());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void connect();
    });
    const httpsWarn =
      location.protocol === "https:"
        ? h("p", { class: "ea-note" }, "This page is on https. Browsers block a Pi on plain http from here, so open EdgeAI with npm run dev on your computer, or in the Pi's own browser, to use this.")
        : null;
    sourcePanel.replaceChildren(
      h("label", { class: "ea-namebox", for: "pi-url" }, "Pi address", h("div", { class: "ea-inline" }, input, connectBtn)),
      ...(httpsWarn ? [httpsWarn] : []),
      err,
      okBanner,
      frame,
      controls,
      help,
    );
    if (prefs.piUrl && location.protocol !== "https:") void connect();
  }

  // ---------- drag and drop, keys
  let dragDepth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  stage.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropHint.hidden = false;
  });
  stage.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  stage.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      dropHint.hidden = true;
    }
  });
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropHint.hidden = true;
    void addFiles([...(e.dataTransfer?.files ?? [])]);
  });

  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, select, textarea, [contenteditable]") || document.querySelector(".ea-scrim")) return;
    if (e.code === "Space" && captureOnce) {
      e.preventDefault();
      void capture(e.shiftKey);
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
      e.preventDefault();
      void confirmDelete();
    } else if (e.key === "Escape" && selected.size) {
      selected.clear();
      render();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      visible().forEach((i) => selected.add(i.id));
      render();
    } else if (e.key.toLowerCase() === "t" && selected.size && !e.ctrlKey && !e.metaKey) {
      void moveTo("test");
    }
  };
  document.addEventListener("keydown", onKey);

  teardown = () => {
    document.removeEventListener("keydown", onKey);
    stopCamera();
    for (const u of thumbUrls.values()) URL.revokeObjectURL(u);
    thumbUrls.clear();
  };

  renderSources();
  await reload();
}
