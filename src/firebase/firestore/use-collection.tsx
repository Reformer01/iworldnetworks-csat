'use client';

import { useState, useEffect, useRef } from 'react';
import { Query, onSnapshot, QuerySnapshot, DocumentData, FirestoreError } from 'firebase/firestore';

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
        const items = snapshot.docs.map((doc) => {
          const d = doc.data();
          return { ...(d ?? {}), id: doc.id };
        }) as unknown as T[];
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        if (!isMounted.current) return;
        
        // SILENT HANDSHAKE: Do not crash on permission errors.
        // This usually happens during the brief window when a user logs in 
        // but the security rules haven't synced with the new token.
        if (err.code === 'permission-denied') {
          console.warn('Firestore: Waiting for authorized session synchronization.');
          setData(null);
        } else {
          console.error('Firestore Error:', err);
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
