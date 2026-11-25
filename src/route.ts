import type { Workspace } from "./views/shell";

/** Routes: "" → projects; "#p/<id>/<workspace>" → a workspace of a project (Data when none is named). */
export function parseRoute(hash: string): { project?: string; ws: Workspace } {
  const m = /^#?p\/([^/]+)(?:\/(data|label|train|test|deploy))?$/.exec(hash);
  return m ? { project: decodeURIComponent(m[1]), ws: (m[2] as Workspace) ?? "data" } : { ws: "data" };
}
