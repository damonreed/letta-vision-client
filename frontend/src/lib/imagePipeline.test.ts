import { describe, expect, it } from "vitest";
import {
  buildMessageContent,
  estimateOutgoingJsonBytes,
  validateOutgoingSize,
} from "./imagePipeline.ts";
import { normalizeOutgoingForSend } from "./chatFailures.js";

function imageBlock(id: string) {
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: "image/png", data: id.repeat(100) },
  };
}

describe("buildMessageContent", () => {
  it("returns empty string when no text or images", () => {
    expect(buildMessageContent("", null)).toBe("");
    expect(buildMessageContent("  ", [])).toBe("");
  });

  it("returns plain string for text-only", () => {
    expect(buildMessageContent("hello", null)).toBe("hello");
  });

  it("returns blocks with text first then one image", () => {
    const img = imageBlock("a");
    const out = buildMessageContent("compare", img);
    expect(out).toEqual([
      { type: "text", text: "compare" },
      img,
    ]);
  });

  it("returns blocks with text first then multiple images", () => {
    const imgs = [imageBlock("a"), imageBlock("b"), imageBlock("c"), imageBlock("d")];
    const out = buildMessageContent("four shots", imgs);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ type: "text", text: "four shots" });
    expect(out.slice(1)).toEqual(imgs);
  });

  it("returns image-only array", () => {
    const imgs = [imageBlock("x"), imageBlock("y")];
    expect(buildMessageContent("", imgs)).toEqual(imgs);
  });
});

describe("validateOutgoingSize", () => {
  it("accepts small multimodal payloads", () => {
    const content = buildMessageContent("hi", [imageBlock("z")]);
    expect(() => validateOutgoingSize(content, 10_000)).not.toThrow();
  });

  it("rejects payloads over the limit", () => {
    const big = imageBlock("x".repeat(50_000));
    const content = buildMessageContent("", [big]);
    expect(() => validateOutgoingSize(content, 1_000)).toThrow(/too large/i);
  });

  it("estimateOutgoingJsonBytes matches JSON body wrapper", () => {
    const content = buildMessageContent("test", imageBlock("q"));
    expect(estimateOutgoingJsonBytes(content)).toBe(
      new TextEncoder().encode(JSON.stringify({ content })).length
    );
  });
});

describe("normalizeOutgoingForSend", () => {
  it("preserves all image blocks", () => {
    const imgs = [imageBlock("1"), imageBlock("2"), imageBlock("3")];
    const outgoing = buildMessageContent("see all", imgs);
    const normalized = normalizeOutgoingForSend(outgoing);
    expect(Array.isArray(normalized)).toBe(true);
    expect(normalized.filter((b) => b.type === "image")).toHaveLength(3);
  });
});
