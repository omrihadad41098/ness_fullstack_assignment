import type { Readable, Writable } from 'node:stream';
import mongoose, { type Types } from 'mongoose';

export const GRIDFS_BUCKET = 'uploads';

export type UploadTarget = {
  /** GridFS file id, available before the stream finishes so cleanup can use it. */
  id: Types.ObjectId;
  stream: Writable;
};

/** Narrow interface so services can be unit-tested with an in-memory fake. */
export type FileStorage = {
  createUploadStream(storageName: string, contentType: string): UploadTarget;
  createDownloadStream(fileId: Types.ObjectId): Readable;
  delete(fileId: Types.ObjectId): Promise<void>;
};

export function createGridFsStorage(): FileStorage {
  // Resolved per call: the bucket must not be captured before mongoose has a live connection.
  const bucket = (): mongoose.mongo.GridFSBucket => {
    const { db } = mongoose.connection;
    if (!db) throw new Error('Cannot use GridFS before connecting to MongoDB');
    return new mongoose.mongo.GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  };

  return {
    createUploadStream(storageName, contentType) {
      // The driver dropped the top-level `contentType` option; the asset document is the source of
      // truth for MIME type anyway, so this copy exists only for inspecting the bucket directly.
      const stream = bucket().openUploadStream(storageName, { metadata: { contentType } });
      return { id: stream.id, stream };
    },

    createDownloadStream(fileId) {
      return bucket().openDownloadStream(fileId);
    },

    async delete(fileId) {
      try {
        await bucket().delete(fileId);
      } catch (err) {
        // Deleting an already-missing file is the desired end state, not an error.
        if (err instanceof mongoose.mongo.MongoRuntimeError) return;
        throw err;
      }
    },
  };
}
