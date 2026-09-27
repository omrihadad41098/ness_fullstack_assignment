import { Types } from 'mongoose';
import { AppError } from '../http/errors.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Deliberately not `mongoose.isValidObjectId`: that accepts any 12-character string
 * (e.g. "abcdefghijkl"), which would turn a client typo into a confusing 404 instead of a 400.
 */
export function parseObjectId(value: unknown, field = 'id'): Types.ObjectId {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new AppError('VALIDATION_ERROR', `"${field}" must be a 24-character hex id`, { field });
  }
  return new Types.ObjectId(value);
}
