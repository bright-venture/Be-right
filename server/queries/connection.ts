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
 */
export const MAX_CONNECTIONS = 10;
const serverless = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

export function getDb() {
  if (!instance) {
    const client = postgres(env.databaseUrl, {
      prepare: false, // compatible with Supabase's transaction pooler (port 6543)
      max: MAX_CONNECTIONS,
      idle_timeout: serverless ? 20 : 0, // seconds; frozen instances shouldn't hold connections
      connect_timeout: 10,
    });
    instance = drizzle(client, { schema: fullSchema });
  }
  return instance;
}
