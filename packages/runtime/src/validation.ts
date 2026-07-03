import type { Context } from "hono";

// Shared zValidator hook: keep the shipped `{ error: string }` 400 shape
// (zValidator's default error response differs).
export function validationHook(
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
  c: Context
) {
  if (!result.success) {
    const issue = result.error?.issues[0];
    const where = issue?.path.join(".") ?? "";
    return c.json({ error: `invalid ${where || "request"}${issue ? `: ${issue.message}` : ""}` }, 400);
  }
}
