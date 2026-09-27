export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, fields: LogFields, message: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (fields: LogFields, message: string) => write('debug', fields, message),
  info: (fields: LogFields, message: string) => write('info', fields, message),
  warn: (fields: LogFields, message: string) => write('warn', fields, message),
  error: (fields: LogFields, message: string) => write('error', fields, message),
};
