// apps/api/src/lib/storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import path from 'path';

const BUCKET = process.env.S3_BUCKET || '';
const REGION = process.env.S3_REGION || 'us-east-1';
const USE_LOCAL = !process.env.S3_BUCKET; // if no bucket, save to /tmp for dev

let s3: S3Client | null = null;

function getS3() {
  if (!s3 && !USE_LOCAL) {
    s3 = new S3Client({
      region: REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          }
        : undefined,
      // MinIO / localstack endpoint support
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }
  return s3;
}

export type MediaType = 'image' | 'audio';

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ALLOWED_AUDIO  = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];

export function validateMediaType(mimetype: string): MediaType | null {
  if (ALLOWED_IMAGES.includes(mimetype)) return 'image';
  if (ALLOWED_AUDIO.includes(mimetype))  return 'audio';
  return null;
}

export interface UploadResult {
  url: string;
  key: string;
  mediaType: MediaType;
}

/**
 * Upload a buffer to S3 (or local /tmp in dev).
 * Returns a public URL.
 */
export async function uploadMedia(
  schoolId: string,
  questionId: string,
  buffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<UploadResult> {
  const mediaType = validateMediaType(mimetype);
  if (!mediaType) throw new Error(`Unsupported media type: ${mimetype}`);

  const ext = path.extname(originalName) || (mediaType === 'image' ? '.jpg' : '.mp3');
  const key = `questions/${schoolId}/${questionId}/${randomUUID()}${ext}`;

  if (USE_LOCAL) {
    // Dev mode — write to /tmp and return a fake URL
    const fs = await import('fs/promises');
    await fs.mkdir(`/tmp/secureexam/${schoolId}/${questionId}`, { recursive: true });
    await fs.writeFile(`/tmp/secureexam/${key.replace('questions/', '')}`, buffer);
    return {
      url: `/dev-media/${key}`,
      key,
      mediaType,
    };
  }

  const client = getS3()!;
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      CacheControl: 'public, max-age=31536000',
    })
  );

  const url = process.env.S3_PUBLIC_URL
    ? `${process.env.S3_PUBLIC_URL}/${key}`
    : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { url, key, mediaType };
}

export async function deleteMedia(key: string): Promise<void> {
  if (USE_LOCAL) return;
  const client = getS3()!;
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Generate a presigned URL for direct browser-to-S3 upload (optional path).
 */
export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  if (USE_LOCAL) return `/api/v1/media/upload`; // fallback to server-side
  const client = getS3()!;
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(client, cmd, { expiresIn: 300 });
}
