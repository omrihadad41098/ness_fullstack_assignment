import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import type { IncomingHttpHeaders } from 'node:http';
import type { Types } from 'mongoose';
import { AppError } from './errors.js';
import { log } from '../logger.js';
import { createContentInspector } from '../validation/contentInspector.js';
import { validateDeclaredFileType } from '../validation/fileType.js';
import type { FileStorage } from '../storage/gridFsStorage.js';
import type { AssetKind } from '../types/api.js';

export const UPLOAD_FIELD = 'files';

export type UploadedFile = {
  originalName: string;
  mimeType: string;
  kind: AssetKind;
  sizeBytes: number;
  fileId: Types.ObjectId;
};

export type UploadLimits = {
  maxBytes: number;
  maxFiles: number;
};

export type UploadParserDeps = UploadLimits & {
  storage: FileStorage;
};

/**
 * Streams a multipart body straight into GridFS: nothing is buffered, nothing is written to disk.
 * Every failure path deletes the GridFS files this request already created, so a rejected upload
 * never leaves orphaned bytes behind.
 */
export function parseUpload(
  req: Readable & { headers: IncomingHttpHeaders },
  deps: UploadParserDeps,
): Promise<UploadedFile[]> {
  return new Promise<UploadedFile[]>((resolve, reject) => {
    let bb: busboy.Busboy;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { fileSize: deps.maxBytes, files: deps.maxFiles },
      });
    } catch {
      reject(
        new AppError(
          'VALIDATION_ERROR',
          'Expected a multipart/form-data body with a "files" field',
        ),
      );
      return;
    }

    const uploaded: UploadedFile[] = [];
    const inFlight: Promise<void>[] = [];
    let failure: AppError | null = null;
    let settled = false;

    /** First failure wins; later ones are noise caused by the first. */
    const recordFailure = (err: unknown): void => {
      failure ??=
        err instanceof AppError
          ? err
          : new AppError('INTERNAL', 'Upload failed', { cause: describe(err) });
    };

    /**
     * Single completion point, reached only once every file task has settled — otherwise cleanup
     * could run before a concurrent upload finishes and leave that file orphaned in GridFS.
     */
    const complete = (): void => {
      if (settled) return;
      settled = true;
      req.unpipe(bb);
      req.resume(); // drain anything left so the socket is not held half-read

      if (failure === null && uploaded.length === 0) {
        failure = new AppError('VALIDATION_ERROR', `No files uploaded under "${UPLOAD_FIELD}"`);
      }
      if (failure === null) {
        resolve(uploaded);
        return;
      }
      const err = failure;
      void discardAll(deps.storage, uploaded).finally(() => reject(err));
    };

    const completeWhenIdle = (): void => {
      void Promise.allSettled(inFlight).then(complete);
    };

    bb.on('file', (fieldName, stream, info) => {
      // After a failure the request is doomed; drain the rest instead of storing more bytes.
      if (failure !== null) {
        stream.resume();
        return;
      }
      if (fieldName !== UPLOAD_FIELD) {
        stream.resume();
        recordFailure(
          new AppError(
            'VALIDATION_ERROR',
            `Unexpected file field "${fieldName}"; upload files under "${UPLOAD_FIELD}"`,
          ),
        );
        return;
      }
      inFlight.push(
        storeFile(stream, info, deps)
          .then((file) => {
            uploaded.push(file);
          })
          .catch(recordFailure),
      );
    });

    bb.on('filesLimit', () => {
      recordFailure(new AppError('VALIDATION_ERROR', `At most ${deps.maxFiles} files per request`));
    });

    bb.on('error', (err: unknown) => {
      recordFailure(err);
      completeWhenIdle(); // busboy may not emit 'close' after an error
    });
    req.on('error', (err: unknown) => {
      recordFailure(err);
      completeWhenIdle();
    });
    bb.on('close', completeWhenIdle);

    req.pipe(bb);
  });
}

/**
 * busboy only advances to the next part once the current file stream has been consumed, so every
 * exit path drains it — bailing out early without draining deadlocks the whole request.
 */
async function storeFile(
  stream: Readable,
  info: busboy.FileInfo,
  deps: UploadParserDeps,
): Promise<UploadedFile> {
  try {
    return await inspectAndStore(stream, info, deps);
  } finally {
    stream.resume();
  }
}

async function inspectAndStore(
  stream: Readable,
  info: busboy.FileInfo,
  deps: UploadParserDeps,
): Promise<UploadedFile> {
  const originalName = info.filename ?? '';
  const { kind, extension } = validateDeclaredFileType(originalName, info.mimeType);
  const inspector = createContentInspector(kind, extension, originalName);

  // A generated name is what GridFS stores; the client filename is display-only metadata.
  const target = deps.storage.createUploadStream(randomUUID(), info.mimeType);
  let sizeBytes = 0;
  let truncated = false;
  // Held on an object: a `let` assigned only inside the transform callback stays narrowed to null.
  const inspection: { error: AppError | null } = { error: null };
  stream.on('limit', () => {
    truncated = true;
  });

  const inspect = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      if (inspection.error === null) {
        try {
          inspector.update(chunk);
        } catch (err) {
          // Remember the verdict but keep the bytes flowing: failing the transform would destroy
          // busboy's file stream and stall the parser. The file is deleted below instead.
          inspection.error =
            err instanceof AppError ? err : new AppError('INTERNAL', describe(err));
        }
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(stream, inspect, target.stream);
    if (truncated) {
      throw new AppError('FILE_TOO_LARGE', `"${originalName}" exceeds the upload size limit`, {
        maxBytes: deps.maxBytes,
      });
    }
    if (inspection.error !== null) throw inspection.error;
    inspector.end();
  } catch (err) {
    await discard(deps.storage, target.id);
    throw err;
  }

  return { originalName, mimeType: info.mimeType, kind, sizeBytes, fileId: target.id };
}

async function discard(storage: FileStorage, fileId: Types.ObjectId): Promise<void> {
  try {
    await storage.delete(fileId);
  } catch (err) {
    // Cleanup must not mask the original failure; an orphaned file is logged, not thrown.
    log.warn({ fileId: fileId.toString(), err: describe(err) }, 'failed to delete partial upload');
  }
}

async function discardAll(storage: FileStorage, files: UploadedFile[]): Promise<void> {
  await Promise.all(files.map((file) => discard(storage, file.fileId)));
  files.length = 0;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
