'use client';

import React, { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Star, Copy, Check } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';

export default function AdminTestimonials() {
  const [filter, setFilter] = useState<'Home' | 'Business'>('Home');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const workspaceImg = PlaceHolderImages.find(img => img.id === 'workspace')!;
  const firestore = useFirestore();

  const testimonialQuery = useMemo(() => {
    if (!firestore) return null;
    return query(
      collection(firestore, 'feedbacks'),
      where('category', '==', 'Testimonials'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
  }, [firestore]);

  const { data: testimonials, loading } = useCollection(testimonialQuery);

  const filteredTestimonials = useMemo(() => {
    if (!testimonials) return [];
    return testimonials.filter((t: any) => 
      filter === 'Home' 
        ? t.servicePlan?.toLowerCase().includes('home') 
        : t.servicePlan?.toLowerCase().includes('business') || t.servicePlan?.toLowerCase().includes('enterprise')
    );
  }, [testimonials, filter]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <h1 className="text-primary mb-4 font-display text-display-lg tracking-tight">Success Stories</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Real stories from our customers. Use these for our marketing updates.</p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex items-end">
          <div className="border border-border bg-white rounded-full p-1 flex w-full">
            <button 
              onClick={() => setFilter('Home')}
              className={cn("flex-1 py-2 rounded-full font-mono text-label-mono transition-all", filter === 'Home' ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Residential
            </button>
            <button 
              onClick={() => setFilter('Business')}
              className={cn("flex-1 py-2 rounded-full font-mono text-label-mono transition-all", filter === 'Business' ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Corporate
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start mb-24">
        <div className="md:col-span-7 space-y-8">
          {filteredTestimonials.slice(0, 5).map((item: any) => (
            <div key={item.id} className="bg-white border border-border p-8 rounded-xl whisper-shadow group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-1 text-secondary">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={cn("w-5 h-5", i < (item.ratings?.signal || 0) ? "fill-secondary text-secondary" : "text-border")} />
                  ))}
                </div>
                <span className="font-mono uppercase text-secondary text-sm tracking-widest opacity-60">{item.servicePlan}</span>
              </div>
              <blockquote className="text-primary leading-tight mb-8 font-display text-[28px] font-bold">
                "{item.comment}"
              </blockquote>
              <div className="flex justify-between items-end">
                <div>
                  <p className="font-mono text-label-mono font-bold">{item.customerName}</p>
                  <p className="text-on-surface-variant text-sm font-mono text-xs opacity-60">{item.location}</p>
                </div>
                <Button 
                  onClick={() => handleCopy(item.id, item.comment)}
                  className="bg-primary text-white px-6 py-6 rounded-full font-mono flex items-center gap-2 hover:scale-105 transition-transform active:scale-95 text-label-mono"
                >
                  {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedId === item.id ? 'Copied!' : 'Copy for Social'}
                </Button>
              </div>
            </div>
          ))}
          {!loading && filteredTestimonials.length === 0 && (
            <p className="text-on-surface-variant py-20 text-center font-mono">No testimonials found for this category.</p>
          )}
        </div>

        <div className="md:col-span-5 space-y-8 md:pt-16">
          <div className="w-full h-80 relative rounded-xl overflow-hidden grayscale contrast-125">
            <Image 
              src={workspaceImg.imageUrl} 
              alt="Workspace" 
              fill 
              className="object-cover opacity-60"
              data-ai-hint="tech workspace"
            />
          </div>
          <div className="bg-surface-container-highest border border-border p-8 rounded-xl whisper-shadow">
            <h4 className="font-bold mb-4">Internal Note</h4>
            <p className="text-sm text-on-surface-variant">These stories are pulled directly from the public feedback portal. Ensure you have consent before using them in public campaigns.</p>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
