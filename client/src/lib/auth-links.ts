/** TanStack locations omit the leading '#'; window.location.hash includes it. */
function fragmentBody(hash: string): string {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

/** Resolve auth-related fragments that arrive on the app's root URL. */
export function authFragmentDestination(hash: string): "/auth" | "/reset-password" | null {
  const fragment = fragmentBody(hash);
  if (fragment.startsWith("reset=")) return "/reset-password";
  if (fragment.startsWith("oauth_error=")) return "/auth";
  return null;
}

/** Extract the opaque base64url reset token from an email-link fragment. */
export function resetTokenFromHash(hash: string): string | null {
  return fragmentBody(hash).match(/^reset=([A-Za-z0-9_-]+)(?:[&#].*)?$/)?.[1] ?? null;
}
