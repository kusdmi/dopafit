import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { AppError } from "../domain/error.js";

export interface StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  maxDimension?: number;
  jpegQuality?: number;
}

export async function optimizeImage(
  data: Uint8Array,
  contentType: string,
  maxDimension = 1600,
  quality = 80,
) {
  if (contentType === "image/gif") return { data, contentType, extension: "gif" };
  try {
    const optimized = await sharp(data)
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    return { data: optimized, contentType: "image/jpeg", extension: "jpg" };
  } catch {
    throw new AppError("validation_error", "Invalid or corrupted image file");
  }
}

export function createFileStorage(config: StorageConfig) {
  const options = {
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  };
  const internal = new S3Client({ ...options, endpoint: config.endpoint });
  // Signing never contacts the browser-facing endpoint, which may be unreachable from the container.
  const publicClient = new S3Client({ ...options, endpoint: config.publicEndpoint });
  return {
    async initialize() {
      try {
        await internal.send(new HeadBucketCommand({ Bucket: config.bucket }));
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404
        )
          throw error;
        try {
          await internal.send(
            new CreateBucketCommand({
              Bucket: config.bucket,
              ...(config.region === "us-east-1"
                ? {}
                : {
                    CreateBucketConfiguration: { LocationConstraint: config.region as "eu-west-1" },
                  }),
            }),
          );
        } catch (createError) {
          if ((createError as { name?: string }).name !== "BucketAlreadyOwnedByYou")
            throw createError;
        }
      }
    },
    async putObject(key: string, data: Uint8Array, contentType: string) {
      await internal.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
    },
    async getObject(key: string) {
      const object = await internal.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!object.Body) throw new AppError("not_found", "Photo not found");
      return {
        data: await object.Body.transformToByteArray(),
        contentType: object.ContentType ?? "application/octet-stream",
      };
    },
    presignedGet(key: string) {
      return getSignedUrl(publicClient, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: 3600,
      });
    },
    async delete(key: string) {
      await internal.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
    optimizeImage: (data: Uint8Array, contentType: string) =>
      optimizeImage(data, contentType, config.maxDimension, config.jpegQuality),
    close() {
      internal.destroy();
      publicClient.destroy();
    },
  };
}
