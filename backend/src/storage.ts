import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Config } from "./config";
import { demand } from "./shared";
export class Storage {
  private client?: S3Client;
  constructor(public config: Config) {
    if (config.storage === "s3")
      this.client = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || "us-east-1",
        forcePathStyle: true,
      });
  }
  private path(key: string) {
    demand(
      /^(quarantine|ready)\/[a-zA-Z0-9.-]+$/.test(key),
      "INVALID_OBJECT_KEY",
      422,
    );
    return resolve(this.config.dataDir, "objects", key);
  }
  async put(key: string, data: Buffer, mime: string) {
    if (this.client)
      await this.client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: data,
          ContentType: mime,
        }),
      );
    else {
      const path = this.path(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    }
  }
  async get(key: string) {
    if (this.client) {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
      return Buffer.from(await r.Body!.transformToByteArray());
    }
    return readFile(this.path(key));
  }
  async size(key: string) {
    if (this.client)
      return (
        await this.client.send(
          new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        )
      ).ContentLength!;
    return (await stat(this.path(key))).size;
  }
  async uploadUrl(key: string, mime: string, size: number) {
    return getSignedUrl(
      this.client!,
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ContentType: mime,
        ContentLength: size,
      }),
      { expiresIn: 600 },
    );
  }
  async downloadUrl(key: string, filename: string) {
    return getSignedUrl(
      this.client!,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: 120 },
    );
  }
}
