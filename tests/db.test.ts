import { beforeEach, describe, expect, it } from "vitest";
import { addImages, createProject, deleteImages, deleteProject, getProject, listImages, listProjects, newId, renameProject, resetDbForTests, updateImages } from "../src/db";
import type { ImageRecord } from "../src/types";

function img(projectId: string, name: string, createdAt: number): ImageRecord {
  return {
    id: newId(), projectId, name, createdAt,
    blob: new Blob(["full"], { type: "image/jpeg" }), thumb: new Blob(["thumb"], { type: "image/jpeg" }),
    width: 1280, height: 960, split: "train", source: "upload", boxes: [],
  };
}

describe("storage", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("creates, lists, renames and finds projects", async () => {
    const a = await createProject("Wheels");
    const b = await createProject("  ", "classify");
    expect(b.name).toBe("Untitled project");
    expect(b.kind).toBe("classify");
    await new Promise((r) => setTimeout(r, 5));
    await renameProject(a.id, "Wheel finder");
    expect((await getProject(a.id))?.name).toBe("Wheel finder");
    const all = await listProjects();
    expect(all.map((p) => p.id)).toEqual([a.id, b.id]); // a was touched last
  });

  it("lists a project's pictures newest first without the full blob", async () => {
    const p = await createProject("Parts");
    const other = await createProject("Other");
    await addImages([img(p.id, "old.jpg", 1), img(p.id, "new.jpg", 2), img(other.id, "x.jpg", 3)]);
    const list = await listImages(p.id);
    expect(list.map((i) => i.name)).toEqual(["new.jpg", "old.jpg"]);
    expect("blob" in list[0]).toBe(false);
    expect(list[0].thumb).toBeTruthy();
  });

  it("moves pictures between splits and deletes them", async () => {
    const p = await createProject("Parts");
    const a = img(p.id, "a.jpg", 1), b = img(p.id, "b.jpg", 2);
    await addImages([a, b]);
    await updateImages([a.id], { split: "test" });
    expect((await listImages(p.id)).find((i) => i.id === a.id)?.split).toBe("test");
    await deleteImages([b.id]);
    expect((await listImages(p.id)).map((i) => i.name)).toEqual(["a.jpg"]);
  });

  it("deleting a project deletes its pictures and nothing else", async () => {
    const p = await createProject("Gone");
    const keep = await createProject("Kept");
    await addImages([img(p.id, "a.jpg", 1), img(keep.id, "b.jpg", 2)]);
    await deleteProject(p.id);
    expect(await getProject(p.id)).toBeUndefined();
    expect(await listImages(p.id)).toEqual([]);
    expect((await listImages(keep.id)).length).toBe(1);
  });
});
