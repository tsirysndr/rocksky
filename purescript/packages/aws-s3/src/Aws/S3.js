import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const dropNulls = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
const orNull = (v) => (v === undefined ? null : v);

export const newClient = (cfg) => () =>
  new S3Client(
    dropNulls({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: cfg.credentials,
      forcePathStyle: cfg.forcePathStyle,
    }),
  );
export const destroy = (c) => () => {
  c.destroy();
};

export const putObjectImpl = (c) => (i) => () =>
  c
    .send(
      new PutObjectCommand(
        dropNulls({
          Bucket: i.bucket,
          Key: i.key,
          Body: i.body,
          ContentType: i.contentType,
          ContentLength: i.contentLength,
        }),
      ),
    )
    .then(() => undefined);

const objectOutput = (r, body) => ({
  body,
  contentType: orNull(r.ContentType),
  contentLength: orNull(r.ContentLength),
  eTag: orNull(r.ETag),
  lastModified: orNull(r.LastModified),
});

export const getObjectBufferImpl = (c) => (bucket) => (key) => async () => {
  const r = await c.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = r.Body ? await r.Body.transformToByteArray() : new Uint8Array(0);
  return objectOutput(r, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
};

export const getObjectStreamImpl = (c) => (bucket) => (key) => async () => {
  const r = await c.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return objectOutput(r, r.Body);
};

export const deleteObjectImpl = (c) => (bucket) => (key) => () =>
  c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).then(() => undefined);

export const headObjectImpl = (c) => (bucket) => (key) => () =>
  c.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then((r) => ({
    contentType: orNull(r.ContentType),
    contentLength: orNull(r.ContentLength),
    eTag: orNull(r.ETag),
    lastModified: orNull(r.LastModified),
  }));

export const headBucketImpl = (c) => (bucket) => () =>
  c.send(new HeadBucketCommand({ Bucket: bucket })).then(() => undefined);

export const listObjectsV2Impl = (c) => (i) => () =>
  c
    .send(
      new ListObjectsV2Command(
        dropNulls({
          Bucket: i.bucket,
          Prefix: i.prefix,
          ContinuationToken: i.continuationToken,
          MaxKeys: i.maxKeys,
        }),
      ),
    )
    .then((r) => ({
      contents: (r.Contents ?? []).map((o) => ({
        key: o.Key ?? "",
        size: o.Size ?? 0,
        eTag: orNull(o.ETag),
        lastModified: orNull(o.LastModified),
      })),
      isTruncated: r.IsTruncated ?? false,
      nextContinuationToken: orNull(r.NextContinuationToken),
      keyCount: r.KeyCount ?? 0,
    }));

export const getSignedUrlImpl = (kind) => (c) => (bucket) => (key) => (expiresIn) => () => {
  const input = { Bucket: bucket, Key: key };
  const cmd = kind === "put" ? new PutObjectCommand(input) : new GetObjectCommand(input);
  return getSignedUrl(c, cmd, { expiresIn });
};

export const errorStatusCodeImpl = (e) => orNull(e?.$metadata?.httpStatusCode);
export const errorNameImpl = (e) => (typeof e?.name === "string" ? e.name : null);

export const getObjectWithSignalImpl = c => bucket => key => signal => async () => {
  const r = await c.send(new GetObjectCommand({Bucket: bucket, Key: key}), {abortSignal: signal});
  const bytes = await r.Body.transformToByteArray();
  return objectOutput(r, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
};

export const getObjectRawImpl = c => bucket => key => range => () => c.send(new GetObjectCommand(dropNulls({ Bucket: bucket, Key: key, Range: range })));
export const transformToWebStream = body => () => body.transformToWebStream();

export const putObjectWithMetadataImpl = c => i => metadata => () => c.send(new PutObjectCommand(dropNulls({ Bucket: i.bucket, Key: i.key, Body: i.body, ContentType: i.contentType, ContentLength: i.contentLength, Metadata: metadata }))).then(() => undefined);
