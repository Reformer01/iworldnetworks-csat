'use client';

import { useState, useEffect, useRef } from 'react';
import { DocumentReference, onSnapshot, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';

export function useDoc<T = DocumentData>(docRef: DocumentReference<T> | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    if (!docRef) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onSnapshot(
        docRef,
        (snapshot: DocumentSnapshot<T>) => {
          if (!isMounted.current) return;
          setData(snapshot.exists() ? { ...snapshot.data()!, id: snapshot.id } : null);
          setLoading(false);
          setError(null);
        },
        async (err) => {
          if (!isMounted.current) return;
          
          if (err.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'get',
            });
            errorEmitter.emit('permission-error', permissionError);
          }
          
          setError(err);
          setLoading(false);
        }
      );
    } catch (e: any) {
      if (isMounted.current) {
        setError(e);
        setLoading(false);
      }
    }

    return () => {
      isMounted.current = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [docRef]);

  return { data, loading, error };
}
