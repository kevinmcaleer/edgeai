// Adding pictures to a project from any source.
import { addImages, listImages, newId } from "./db";
import { encodeBlob, isImageFile, type Encoded } from "./imaging";
import { splitsFor } from "./split";
import type { ImageRecord, Source, Split } from "./types";

export type SplitChoice = "auto" | Split;

async function counts(projectId: string): Promise<{ train: number; test: number }> {
  const all = await listImages(projectId);
  return { train: all.filter((i) => i.split === "train").length, test: all.filter((i) => i.split === "test").length };
}

/** Stores already-encoded pictures, choosing splits. Returns the records added. */
export async function addEncoded(
  projectId: string,
  items: { encoded: Encoded; name: string }[],
  source: Source,
  split: SplitChoice = "auto",
): Promise<ImageRecord[]> {
  if (!items.length) return [];
  const c = await counts(projectId);
  const splits: Split[] = split === "auto" ? splitsFor(items.length, c.train, c.test) : items.map(() => split);
  const now = Date.now();
  const records: ImageRecord[] = items.map((it, i) => ({
    id: newId(),
    projectId,
    name: it.name,
    blob: it.encoded.blob,
    thumb: it.encoded.thumb,
    width: it.encoded.width,
    height: it.encoded.height,
    split: splits[i],
    source,
    createdAt: now + i,
    boxes: [],
  }));
  await addImages(records);
  return records;
}

export interface ImportResult {
  added: number;
  skipped: string[];
}

/** Imports uploaded or dropped files. Files that are not pictures, or fail to decode, are skipped and named. */
export async function importFiles(projectId: string, files: Iterable<File>, split: SplitChoice = "auto", onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const list = [...files];
  const skipped: string[] = [];
  const ok: { encoded: Encoded; name: string }[] = [];
  let doneCount = 0;
  for (const f of list) {
    if (!isImageFile(f)) {
      skipped.push(f.name);
    } else {
      try {
        ok.push({ encoded: await encodeBlob(f), name: f.name.replace(/\.[^.]+$/, "") + ".jpg" });
      } catch {
        skipped.push(f.name);
      }
    }
    onProgress?.(++doneCount, list.length);
  }
  const added = await addEncoded(projectId, ok, "upload", split);
  return { added: added.length, skipped };
}
