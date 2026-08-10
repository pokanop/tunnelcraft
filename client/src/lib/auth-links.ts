/** Resolve auth-related fragments that arrive on the app's root URL. */
export function authFragmentDestination(hash: string): "/auth" | "/reset-password" | null {
  if (hash.startsWith("#reset=")) return "/reset-password";
  if (hash.startsWith("#oauth_error=")) return "/auth";
  return null;
}

/** Extract the opaque base64url reset token from an email-link fragment. */
export function resetTokenFromHash(hash: string): string | null {
  return hash.match(/^#reset=([A-Za-z0-9_-]+)$/)?.[1] ?? null;
}
