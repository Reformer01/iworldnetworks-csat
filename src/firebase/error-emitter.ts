
'use client';

import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type FirebaseErrorEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

class FirebaseErrorEmitter extends EventEmitter {
  emit<K extends keyof FirebaseErrorEvents>(event: K, ...args: Parameters<FirebaseErrorEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof FirebaseErrorEvents>(event: K, listener: FirebaseErrorEvents[K]): this {
    return super.on(event, listener);
  }
}

export const errorEmitter = new FirebaseErrorEmitter();
