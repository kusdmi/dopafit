import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { optimizeImage, createFileStorage } from "../src/platform/storage.js";

describe("image optimization and private object URLs", () => {
  it("resizes raster images, honors EXIF rotation, strips metadata and encodes JPEG", async () => {
    const raw = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await optimizeImage(raw, "image/jpeg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
    const metadata = await sharp(result.data).metadata();
    expect(metadata).toMatchObject({ width: 800, height: 1600 });
    expect(metadata.exif).toBeUndefined();
  });
  it("preserves GIF animation bytes and rejects corrupted raster files", async () => {
    const raw = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } })
      .gif()
      .toBuffer();
    expect(await optimizeImage(raw, "image/gif")).toEqual({
      data: raw,
      contentType: "image/gif",
      extension: "gif",
    });
    await expect(optimizeImage(new Uint8Array([1, 2, 3]), "image/jpeg")).rejects.toMatchObject({
      code: "validation_error",
    });
  });
  it("signs private GET URLs with the public endpoint and a one-hour expiration without network", async () => {
    const storage = createFileStorage({
      endpoint: "http://minio:9000",
      publicEndpoint: "https://media.example.test",
      region: "us-east-1",
      bucket: "photos",
      accessKey: "test-access",
      secretKey: "test-secret",
    });
    try {
      const url = new URL(await storage.presignedGet("private/user/photo.jpg"));
      expect(url.origin).toBe("https://media.example.test");
      expect(url.pathname).toBe("/photos/private/user/photo.jpg");
      expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      storage.close();
    }
  });
});
