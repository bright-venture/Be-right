// Work that can finish after the answer is sent (notification emails and push): whoever pressed
// "Send" shouldn't wait for Resend or Firebase. On Netlify the function stays alive until it's
// done (context.waitUntil); the Node server simply keeps going. Outside a request scope (tests,
// scripts, the dev server) it runs right away and is waited for, exactly as before.
import { AsyncLocalStorage } from "node:async_hooks";

type Scope = { waitUntil: (work: Promise<unknown>) => void };
const scope = new AsyncLocalStorage<Scope>();

/** Handles one request so that work given to afterResponse() is kept alive by `waitUntil`. */
export function withAfterResponse<T>(waitUntil: Scope["waitUntil"], handle: () => T): T {
  return scope.run({ waitUntil }, handle);
}

/** Runs `task` once the answer is on its way when possible, or now otherwise. Never throws. */
export async function afterResponse(task: () => Promise<unknown>): Promise<void> {
  const run = () => task().catch((error) => console.error("[after-response] failed", error));
  const current = scope.getStore();
  if (!current) {
    await run();
    return;
  }
  current.waitUntil(run());
}
