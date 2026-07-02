/* Route descriptors used by views to navigate, mapped onto real URLs.
   Components call go(route); the shell translates to router paths. */

export type Route =
  | { v: "landing" }
  | { v: "home" } // the curriculum map (kept for existing callers)
  | { v: "dashboard" }
  | { v: "track"; id: string }
  | { v: "auth" }
  | { v: "account" }
  | { v: "review" }
  | { v: "glossary" }
  | { v: "exam"; track: string }
  | { v: "mod"; id: string; tab?: string };

export function routeToPath(r: Route): string {
  switch (r.v) {
    case "landing":
      return "/";
    case "home":
      return "/learn";
    case "dashboard":
      return "/dashboard";
    case "track":
      return "/tracks/" + r.id;
    case "auth":
      return "/auth";
    case "account":
      return "/account";
    case "review":
      return "/review";
    case "glossary":
      return "/glossary";
    case "exam":
      return "/exam/" + r.track;
    case "mod":
      return "/m/" + r.id + (r.tab ? "/" + r.tab : "");
    default:
      return "/";
  }
}
