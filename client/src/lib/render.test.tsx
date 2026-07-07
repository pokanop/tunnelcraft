import { mock, describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    className,
    children,
  }: {
    to: string;
    params: { modId: string };
    className?: string;
    children: React.ReactNode;
  }) => (
    <a className={className} href={to.replace("$modId", params.modId)}>
      {children}
    </a>
  ),
}));

import { md } from "./render";
import { MOD_CODE_TO_ID, rfcUrl } from "./curriculum-links";

function markup(text: string): string {
  return renderToStaticMarkup(<>{md(text)}</>);
}

describe("md()", () => {
  it("renders backticks and bold unchanged", () => {
    expect(markup("plain **bold** and `code`")).toContain("<strong>bold</strong>");
    expect(markup("plain **bold** and `code`")).toContain('<code class="ic">code</code>');
  });

  it("auto-links module cross-refs with client-side router links", () => {
    const html = markup("See N01 for CIDR and T03 for WireGuard.");
    expect(html).toContain(`href="/m/${MOD_CODE_TO_ID["N01"]}"`);
    expect(html).toContain(`href="/m/${MOD_CODE_TO_ID["T03"]}"`);
    expect(html).toContain(">N01<");
    expect(html).toContain(">T03<");
  });

  it("auto-links possessive module refs without including 's in the link", () => {
    const html = markup("N11's SNAT behavior");
    expect(html).toContain(`href="/m/${MOD_CODE_TO_ID["N11"]}"`);
    expect(html).toContain(">N11</a>&#x27;s");
  });

  it("auto-links RFC references as external anchors", () => {
    const html = markup("Private ranges are in RFC 1918.");
    expect(html).toContain(`href="${rfcUrl(1918)}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain(">RFC 1918<");
  });

  it("auto-links slash-separated RFC pairs", () => {
    const html = markup("STUN is RFC 5389/8489.");
    expect(html).toContain(`href="${rfcUrl(5389)}"`);
    expect(html).toContain(`href="${rfcUrl(8489)}"`);
  });

  it("does not link module codes inside backticks", () => {
    const html = markup("Use `N01` literally.");
    expect(html).not.toContain('href="/m/');
    expect(html).toContain('<code class="ic">N01</code>');
  });

  it("renders explicit markdown links as external anchors", () => {
    const html = markup(
      "[Tailscale NAT essay](https://tailscale.com/blog/how-nat-traversal-works)"
    );
    expect(html).toContain('href="https://tailscale.com/blog/how-nat-traversal-works"');
    expect(html).toContain(">Tailscale NAT essay<");
  });
});
