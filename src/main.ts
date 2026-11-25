import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/app.css";
import { getProject } from "./db";
import { h, icon } from "./ui/dom";
import { dataView, leaveData } from "./views/data";
import { projectsView } from "./views/projects";
import { applySavedTheme, shell } from "./views/shell";
import { parseRoute } from "./route";
import { soon } from "./views/soon";

applySavedTheme();
const root = document.getElementById("app")!;

let unlabelled = 0;

async function route(): Promise<void> {
  leaveData();
  document.querySelector(".ea-menu.ea-floating")?.remove();
  const r = parseRoute(location.hash);
  try {
    if (!r.project) {
      document.title = "EdgeAI";
      await projectsView(root);
      return;
    }
    const project = await getProject(r.project);
    if (!project) {
      location.hash = "";
      return;
    }
    document.title = `${project.name} · EdgeAI`;
    const body = shell(root, project, r.ws, unlabelled ? { label: String(unlabelled) } : {});
    if (r.ws === "data") {
      await dataView(body, project, (n) => {
        unlabelled = n;
        const rail = root.querySelector('.ea-rail-btn[href$="/label"]');
        rail?.querySelector(".ea-rail-badge")?.remove();
        if (n && rail) rail.append(h("b", { class: "ea-rail-badge", title: `${n} pictures have no boxes yet` }, n > 999 ? "999+" : String(n)));
      });
    } else {
      soon(body, r.ws);
    }
  } catch (err) {
    root.replaceChildren(
      h(
        "main",
        { class: "ea-stage ea-empty" },
        h("span", { class: "ea-empty-icon", style: "color:var(--danger)" }, icon("warning", 28)),
        h("h1", { class: "ea-empty-title" }, "EdgeAI could not open its storage"),
        h("p", { class: "ea-empty-text" }, err instanceof Error ? err.message : String(err)),
        h("p", { class: "ea-empty-text" }, "Private windows and some privacy settings block in-browser storage. Try a normal window."),
      ),
    );
  }
}

window.addEventListener("hashchange", () => void route());
void route();
