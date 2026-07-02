/* Tiny user-agent describer: raw UA string → "Chrome on Windows".
   Ordered sniffing (Edge/Opera before Chrome, Chrome before Safari) covers the
   real-world cases without a parser dependency. Unknowns degrade gracefully. */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  if (ua === "oauth") return "Social sign-in";
  if (/curl|wget|httpie|python-requests|postman/i.test(ua)) return "API client";

  let browser = "Unknown browser";
  if (/edg(a|ios)?\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/samsungbrowser\//i.test(ua)) browser = "Samsung Internet";
  else if (/firefox\/|fxios\//i.test(ua)) browser = "Firefox";
  else if (/crios\//i.test(ua)) browser = "Chrome";
  else if (/chrome\/|chromium\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = "Safari";

  let os = "unknown OS";
  if (/windows nt/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/cros/i.test(ua)) os = "ChromeOS";
  else if (/linux/i.test(ua)) os = "Linux";

  if (browser === "Unknown browser" && os === "unknown OS") return "Unknown device";
  return browser + " on " + os;
}
