import { serve } from "@hono/node-server";
import { compress } from "hono/compress";
import app from "./app";
import { withAfterResponse } from "./lib/afterResponse";
import { serveStaticFiles } from "./lib/vite";

// Standalone Node server (local production run, Docker, any VPS).
// Netlify/CDNs compress on their own; here we do it ourselves.
app.use(compress());
serveStaticFiles(app);

const port = parseInt(process.env.PORT || "3000");
// A long-running server: notifications simply carry on after the answer.
const keepGoing = (work: Promise<unknown>) => void work;
serve({ fetch: (req) => withAfterResponse(keepGoing, () => app.fetch(req)), port, hostname: "0.0.0.0" }, () => {
  console.log(`Server running on http://localhost:${port}/`);
});
