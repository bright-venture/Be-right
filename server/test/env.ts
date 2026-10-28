// The server settings every test runs with (server/lib/env.ts), so each test file mocks them
// in one line: vi.mock("./lib/env", async () => ({ env: (await import("./test/env")).testEnv() }))
// No imports here: the mock loads this file before anything else.

export function testEnv(overrides: Record<string, unknown> = {}) {
  return {
    isProduction: false,
    databaseUrl: "",
    directDatabaseUrl: "",
    supabaseUrl: "",
    supabaseServiceRoleKey: "",
    storageBucket: "test",
    docsBucket: "test-docs",
    siteUrl: "https://be-rightbright.com",
    // emails and push are faked in the tests that check them
    resendApiKey: "",
    firebaseServiceAccount: "",
    emailFrom: "Be Right <noreply@be-rightbright.com>",
    emailReplyTo: "hello@be-rightbright.com",
    adminEmails: [] as string[],
    ...overrides,
  };
}
