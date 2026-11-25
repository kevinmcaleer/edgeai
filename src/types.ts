export type ProjectKind = "detect" | "classify";
export type Split = "train" | "test";
export type Source = "upload" | "camera" | "pi";

export interface Project {
  id: string;
  name: string;
  /** detect: draw boxes round each thing. classify: one class per picture. */
  kind: ProjectKind;
  createdAt: number;
  updatedAt: number;
}

/** A box in pixels of the stored picture. Filled in by the Label workspace (step 2). */
export interface Box {
  classId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageRecord {
  id: string;
  projectId: string;
  name: string;
  /** The picture, re-encoded as JPEG with its long side at most MAX_SIDE px. */
  blob: Blob;
  /** A small JPEG for the grid. */
  thumb: Blob;
  width: number;
  height: number;
  split: Split;
  source: Source;
  createdAt: number;
  boxes: Box[];
}

/** An image as listed in the grid: everything but the full-size blob. */
export type ImageSummary = Omit<ImageRecord, "blob">;
