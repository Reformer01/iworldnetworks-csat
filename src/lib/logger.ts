export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  requestId?: string;
  route?: string;
  method?: string;
  duration?: number;
  error?: string;
  [key: string]: unknown;
}

let requestIdCounter = 0;

export function generateRequestId(): string {
  requestIdCounter += 1;
  return `req_${Date.now()}_${requestIdCounter}`;
}

function writeLog(entry: LogEntry): void {
  if (entry.level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (entry.level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export function logInfo(message: string, meta?: Partial<LogEntry>): void {
  writeLog({ level: 'info', message, ...meta });
}

export function logWarn(message: string, meta?: Partial<LogEntry>): void {
  writeLog({ level: 'warn', message, ...meta });
}

export function logError(message: string, meta?: Partial<LogEntry>): void {
  writeLog({ level: 'error', message, ...meta });
}
