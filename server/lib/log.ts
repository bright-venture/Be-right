// Server log lines carry the request they belong to: "[a1b2c3d4] [notify] quoteSent failed".
// Each API request gets a short id (also sent back as the X-Request-Id header), so one request
// can be followed in Netlify's log (Logs → Functions → api) even when many run at once.
// Outside a request (the daily clean-up, start-up), lines are written as they are.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

const current = new AsyncLocalStorage<string>();

/** Handles one request under a new id (work it starts, even after the answer, keeps the id). */
export function withRequestId<T>(handle: (id: string) => T): T {
  const id = randomBytes(4).toString("hex");
  return current.run(id, () => handle(id));
}

/** The current request's id (undefined outside a request). */
export const requestId = () => current.getStore();

const tagged = (args: unknown[]) => {
  const id = current.getStore();
  return id ? [`[${id}]`, ...args] : args;
};

export const log = {
  info: (...args: unknown[]) => console.info(...tagged(args)),
  warn: (...args: unknown[]) => console.warn(...tagged(args)),
  error: (...args: unknown[]) => console.error(...tagged(args)),
};
