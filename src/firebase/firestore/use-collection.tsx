
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
        
        // Silent Handshake: 
        // We suppress permission errors in the UI during auth transitions
        // to prevent the Next.js error overlay from disrupting the experience.
        if (err.code === 'permission-denied') {
          console.warn('Firestore: Transient permission denial during auth handshake.');
        } else {
          setError(err);
        }
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
