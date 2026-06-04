'use client';

import { useState, useEffect, useRef } from 'react';
import { Query, onSnapshot, QuerySnapshot, DocumentData, FirestoreError } from 'firebase/firestore';
import { errorEmitter } from '../error-emitter';
import { FirestorePermissionError } from '../errors';

export function useCollection<T = DocumentData>(query: Query<T> | null) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    
    if (!query) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = onSnapshot(
        query,
        (snapshot: QuerySnapshot<T>) => {
          if (!isMounted.current) return;
          const items = snapshot.docs.map((doc) => ({
            ...(doc.data() as any),
            id: doc.id,
          }));
          setData(items);
          setLoading(false);
          setError(null);
        },
        async (err: FirestoreError) => {
          if (!isMounted.current) return;
          
          if (err.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: (query as any)._query?.path?.toString() || 'unknown',
              operation: 'list',
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
  }, [query]);

  return { data, loading, error };
}
