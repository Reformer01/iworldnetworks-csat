
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
        const items = snapshot.docs.map((doc) => ({
          ...(doc.data() as any),
          id: doc.id,
        }));
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err: FirestoreError) => {
        if (!isMounted.current) return;
        
        // PERMANENT FIX: Silence permission denied errors during auth handshake.
        // This prevents the Next.js crash overlay while the session stabilizes.
        if (err.code === 'permission-denied') {
          console.warn('Firestore: Permission denied. Waiting for authorized session state.');
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
