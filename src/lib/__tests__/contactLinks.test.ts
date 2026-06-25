import { describe, it, expect } from "vitest";
import { buildWaMeUrl, buildMailto, buildInstagramUrl, buildSocialUrl } from "../contactLinks";
describe("contactLinks", () => {
  it("wa.me strips + and spaces", () => expect(buildWaMeUrl("+62 812-3456")).toBe("https://wa.me/628123456"));
  it("mailto", () => expect(buildMailto("a@b.com")).toBe("mailto:a@b.com"));
  it("instagram strips @", () => expect(buildInstagramUrl("@frollie")).toBe("https://instagram.com/frollie"));
  it("social prefers url", () => expect(buildSocialUrl({ platform: "tiktok", handle: "x", url: "https://t/x" })).toBe("https://t/x"));
  it("empty → null", () => expect(buildWaMeUrl("")).toBeNull());
});
