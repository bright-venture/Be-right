import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;

/**
 * A serverless instance (Netlify runs on AWS Lambda) serves one request at a time; a
 * long-running Node server shares one pool across all requests.
 *
 * Never fewer connections than the most questions one request asks at once (the admin
 * overview asks 8): with fewer, postgres.js queues several questions on one connection, and
 * Supabase's transaction pooler never answers them. The request then hangs until Netlify
 * cuts it off (seen live: admin overview loading forever with 3 connections).
 *
 * A long-running server (`npm run dev`, boot.ts) answers many requests at once, so all 10
 * connections can be busy and the same hang happens there (seen locally: the dev server
 * died 2 minutes later on "canceling statement due to statement timeout"). It uses the
 * session pooler (DIRECT_DATABASE_URL, port 5432) when there is one: it answers queued
 * questions. Netlify stays on the transaction pooler, built for serverless.
 *
 * In session mode every open connection holds one of the project's database connections,
 * which the live site needs too: so fewer of them (queued questions are answered there), and
 * closed after half a minute unused.
 */
export const MAX_CONNECTIONS = 10;
const SESSION_CONNECTIONS = 5;
const serverless = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * A long-running server must survive a query failing with nobody waiting for it (a hung
 * question cut off by the database's statement timeout): log it instead of stopping the
 * process. Any other unhandled error still stops it, as Node does by default.
 */
function keepServingOnLostQueryErrors() {
  const flag = "__beRightDbRejectionGuard";
  const holder = globalThis as Record<string, unknown>;
  if (serverless || holder[flag]) return; // once, even when the dev server reloads this file
  holder[flag] = true;
  process.on("unhandledRejection", (reason) => {
    if (reason instanceof Error && reason.name === "PostgresError") {
      console.error("[db] a query failed with no request waiting for it", reason);
      return;
    }
    throw reason;
  });
}

export function getDb() {
  if (!instance) {
    keepServingOnLostQueryErrors();
    const session = !serverless && !!env.directDatabaseUrl;
    const client = postgres(session ? env.directDatabaseUrl : env.databaseUrl, {
      prepare: false, // compatible with Supabase's transaction pooler (port 6543)
      max: session ? SESSION_CONNECTIONS : MAX_CONNECTIONS,
      // seconds; frozen instances and session connections shouldn't hold connections
      idle_timeout: serverless ? 20 : session ? 30 : 0,
      connect_timeout: 10,
    });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
