import { h, icon } from "../ui/dom";
import { WORKSPACES, type Workspace } from "./shell";

const WHAT: Record<Exclude<Workspace, "data">, string> = {
  label: "Draw boxes round the things in each picture, pick their class with 1 to 8, and move on with N.",
  train: "Train a small model in this browser and watch its loss fall, epoch by epoch.",
  test: "Run the model on pictures it has not seen and see where it gets things wrong.",
  deploy: "Download an ONNX model and a Python script that runs it on a Raspberry Pi.",
};

export function soon(body: HTMLElement, ws: Exclude<Workspace, "data">): void {
  const w = WORKSPACES.find((x) => x.id === ws)!;
  body.append(
    h(
      "main",
      { class: "ea-stage ea-empty" },
      h("span", { class: "ea-empty-icon" }, icon(w.icon, 28)),
      h("h1", { class: "ea-empty-title" }, `${w.label} is coming in step ${w.step}`),
      h("p", { class: "ea-empty-text" }, WHAT[ws]),
      h("p", { class: "ea-empty-text" }, "Your pictures are safe in this browser in the meantime."),
    ),
  );
}
