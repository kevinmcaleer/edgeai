import { describe, expect, it } from "vitest";
import { nextSplit, splitsFor } from "../src/split";
import { captureName, fitWithin, isImageFile } from "../src/imaging";
import { blockedByHttps, normalisePiUrl } from "../src/capture/pi";
import { parseRoute } from "../src/route";
import { ago } from "../src/views/projects";

describe("split", () => {
  it("keeps about one in five pictures for testing", () => {
    const s = splitsFor(100, 0, 0);
    expect(s.filter((x) => x === "test").length).toBe(20);
    expect(s.slice(0, 5)).toEqual(["train", "train", "test", "train", "train"]);
  });
  it("catches Test up when it has fallen behind", () => {
    expect(nextSplit(40, 0)).toBe("test");
    expect(nextSplit(4, 6)).toBe("train");
  });
});

describe("imaging", () => {
  it("fits the long side without enlarging", () => {
    expect(fitWithin(4032, 3024, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3024, 4032, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(640, 480, 1280)).toEqual({ width: 640, height: 480 });
  });
  it("names captures by time", () => {
    expect(captureName("cam", new Date(2026, 10, 25, 9, 5, 7), 3)).toBe("cam-2026-11-25-090507-3.jpg");
  });
  it("recognises pictures by type or name", () => {
    expect(isImageFile(new File([""], "a.JPG"))).toBe(true);
    expect(isImageFile(new File([""], "x", { type: "image/png" }))).toBe(true);
    expect(isImageFile(new File([""], "notes.txt", { type: "text/plain" }))).toBe(false);
  });
});

describe("Pi address", () => {
  it("adds http and the default port", () => {
    expect(normalisePiUrl("robot.local")).toBe("http://robot.local:8000");
    expect(normalisePiUrl(" robot.local:9000/ ")).toBe("http://robot.local:9000");
    expect(normalisePiUrl("https://pi.example")).toBe("https://pi.example");
    expect(normalisePiUrl("192.168.1.20:8000")).toBe("http://192.168.1.20:8000");
  });
  it("refuses an empty address", () => {
    expect(() => normalisePiUrl("  ")).toThrow(/address/);
  });
  it("knows https pages cannot load an http Pi", () => {
    expect(blockedByHttps("http://robot.local:8000", "https:")).toBe(true);
    expect(blockedByHttps("http://robot.local:8000", "http:")).toBe(false);
  });
});

describe("routes and times", () => {
  it("parses project routes", () => {
    expect(parseRoute("")).toEqual({ ws: "data" });
    expect(parseRoute("#p/abc")).toEqual({ project: "abc", ws: "data" });
    expect(parseRoute("#p/abc/label")).toEqual({ project: "abc", ws: "label" });
    expect(parseRoute("#p/abc/nope")).toEqual({ ws: "data" });
  });
  it("says how long ago", () => {
    const now = 1_000_000_000;
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 26 * 3600_000, now)).toBe("yesterday");
  });
});
