// Verifying the browser's sign-in token: a bad token is "not signed in", but a server that
// can't check tokens at all must say so (it used to look like "Sign in does nothing").
import { describe, expect, it, vi } from "vitest";
import { AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";

const getClaims = vi.hoisted(() => vi.fn());
vi.mock("./lib/supabase", () => ({ getSupabaseAdmin: () => ({ auth: { getClaims } }) }));
vi.mock("./queries/users", () => ({
  findOrCreateUser: async (identity: { authId: string }) => ({ id: 1, authId: identity.authId }),
}));

const signedIn = (token: string) => new Headers({ authorization: `Bearer ${token}` });

describe("authenticateRequest", () => {
  it("treats visitors and bad tokens as signed out", async () => {
    const { authenticateRequest } = await import("./lib/auth");
    expect(await authenticateRequest(new Headers())).toBeUndefined();
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthInvalidJwtError("Invalid JWT signature") });
    expect(await authenticateRequest(signedIn("forged"))).toBeUndefined();
  });

  it("fails loudly when tokens can't be checked at all", async () => {
    const { authenticateRequest } = await import("./lib/auth");
    getClaims.mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(authenticateRequest(signedIn("real"))).rejects.toThrow("fetch failed");
  });

  it("loads the account for a valid token", async () => {
    const { authenticateRequest } = await import("./lib/auth");
    getClaims.mockResolvedValueOnce({ data: { claims: { sub: "auth-1", email: "a@example.com" } }, error: null });
    expect(await authenticateRequest(signedIn("real"))).toMatchObject({ authId: "auth-1" });
  });
});
