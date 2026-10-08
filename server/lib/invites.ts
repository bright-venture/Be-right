import { getSupabaseAdmin } from "./supabase";

/**
 * An invitation was sent but the account couldn't be saved here: delete the invited login,
 * so the link in the email stops working and nobody signs in half set up (for example as a
 * customer instead of staff). The person is simply invited again once it works.
 */
export async function withdrawInvitation(authId: string) {
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(authId);
  if (error) console.error("[invite] could not withdraw the invitation", authId, error);
}

/** Saves the invited account; if that fails, withdraws the invitation and reports it. */
export async function saveInvitedAccount<T>(authId: string, save: () => Promise<T>): Promise<T> {
  try {
    return await save();
  } catch (error) {
    await withdrawInvitation(authId);
    throw error;
  }
}
