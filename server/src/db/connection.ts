import mongoose from 'mongoose';
import { log } from '../logger.js';

export async function connectToMongo(uri: string): Promise<void> {
  mongoose.connection.on('disconnected', () => log.warn({}, 'mongodb disconnected'));
  mongoose.connection.on('reconnected', () => log.info({}, 'mongodb reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  log.info({ db: mongoose.connection.name }, 'mongodb connected');
}

export function isDbUp(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectFromMongo(): Promise<void> {
  await mongoose.disconnect();
}
