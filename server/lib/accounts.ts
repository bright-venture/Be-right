import { getSupabaseAdmin } from "./supabase";

/** Removes the sign-in itself (email + password) from Supabase Auth. */
export async function deleteAuthUser(authId: string) {
  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(authId);
  if (error && !/not found/i.test(error.message)) throw error;
}
