// netlify.toml lists the app's pages so unknown URLs can get a real 404.
// Adding a page in src/App.tsx without listing it would make that page a 404.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
// Pages that exist only in the phone app ({isAppUi && <Route …>}) never reach Netlify:
// the app loads its pages from the phone itself.
const appRoutes = readFileSync(path.join(root, "src/App.tsx"), "utf8")
  .split("\n")
  .filter((line) => !line.includes("isAppUi &&"))
  .flatMap((line) => [...line.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))
  .filter((r) => r !== "/" && r !== "*");
const redirects = readFileSync(path.join(root, "netlify.toml"), "utf8")
  .split("[[redirects]]")
  .slice(1)
  .map((block) => ({
    from: /from\s*=\s*"([^"]+)"/.exec(block)![1],
    to: /to\s*=\s*"([^"]+)"/.exec(block)![1],
    status: Number(/status\s*=\s*(\d+)/.exec(block)![1]),
  }));

describe("Netlify page rules", () => {
  it("serves every page of the app", () => {
    const pages = redirects.filter((r) => r.to === "/index.html" && r.status === 200).map((r) => r.from);
    expect(pages.sort()).toEqual([...appRoutes].sort());
  });

  it("answers anything else with a 404, after every other rule", () => {
    expect(redirects.at(-1)).toEqual({ from: "/*", to: "/index.html", status: 404 });
  });
});
