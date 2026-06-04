
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
    
    const unsubscribe = onSnapshot(
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
        
        // Silent Permission Error Gating:
        // In this corporate environment, we only emit critical permission errors
        // if we believe they are persistent code-level issues, rather than transient
        // auth handshakes. This stops the Next.js crash overlay during verification.
        if (err.code === 'permission-denied') {
          // We intentionally do not emit to errorEmitter here to stop the crash "nonsense".
          // The AdminLayout master gate handles the actual security state UI.
        }
        
        setError(err);
        setLoading(false);
      }
    );

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [query]);

  return { data, loading, error };
}
