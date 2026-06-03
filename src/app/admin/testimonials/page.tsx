
'use client';

import React, { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Star, Copy, Check, MousePointer2 } from 'lucide-react';
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

  const testimonialQuery = useMemo(() => firestore ? query(collection(firestore, 'feedbacks'), where('category', '==', 'Testimonials'), orderBy('timestamp', 'desc'), limit(50)) : null, [firestore]);
  const { data: testimonials } = useCollection(testimonialQuery);

  const stats = useMemo(() => {
    if (!testimonials) return { referrals: {} };
    const referrals: Record<string, number> = {};
    testimonials.forEach((t: any) => {
      const source = t.referralSource || 'Unknown';
      referrals[source] = (referrals[source] || 0) + 1;
    });
    return { referrals };
  }, [testimonials]);

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
      <div className="mb-12">
        <p className="font-mono text-label-mono text-secondary mb-2 uppercase text-[10px]">Head of Content: Reformer</p>
        <h1 className="text-primary mb-4 font-display text-3xl md:text-display-lg tracking-tight">Success Stories</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">Analyze customer referrals and curate marketing testimonials.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">
        <div className="md:col-span-8 space-y-6">
          <div className="flex border-b border-border mb-8">
            <button onClick={() => setFilter('Home')} className={cn("px-8 py-4 font-mono text-xs uppercase tracking-widest transition-all", filter === 'Home' ? "border-b-2 border-secondary text-secondary font-bold" : "text-on-surface-variant")}>Residential</button>
            <button onClick={() => setFilter('Business')} className={cn("px-8 py-4 font-mono text-xs uppercase tracking-widest transition-all", filter === 'Business' ? "border-b-2 border-secondary text-secondary font-bold" : "text-on-surface-variant")}>Corporate</button>
          </div>

          {filteredTestimonials.map((item: any) => (
            <div key={item.id} className="bg-white border border-border p-8 rounded-xl whisper-shadow relative group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={cn("w-4 h-4", i < (item.ratings?.signal || 5) ? "fill-secondary text-secondary" : "text-border")} />
                  ))}
                </div>
                <span className="font-mono text-[10px] uppercase text-secondary font-bold">{item.referralSource || 'Unknown'} Referral</span>
              </div>
              <blockquote className="text-primary leading-tight mb-8 font-display text-2xl font-bold italic">
                "{item.comment}"
              </blockquote>
              <div className="flex justify-between items-end border-t border-border/50 pt-6">
                <div>
                  <p className="font-mono text-xs font-bold">{item.customerName}</p>
                  <p className="text-on-surface-variant text-[10px] font-mono opacity-60">{item.location} • {item.servicePlan}</p>
                </div>
                <Button onClick={() => handleCopy(item.id, item.comment)} size="sm" className="bg-primary text-white rounded-full font-mono text-[10px] px-6">
                  {copiedId === item.id ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copiedId === item.id ? 'Copied' : 'Copy Testimonial'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-4 space-y-6">
          <div className="bg-white border border-border p-8 rounded-xl whisper-shadow">
            <h4 className="font-mono text-[10px] uppercase tracking-widest mb-6 text-secondary font-bold">Lead Sources</h4>
            <div className="space-y-4">
              {Object.entries(stats.referrals).map(([source, count]: any) => (
                <div key={source} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs font-mono">{source}</span>
                  <span className="bg-muted px-2 py-1 rounded text-xs font-bold">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-64 rounded-xl overflow-hidden">
            <Image src={workspaceImg.imageUrl} alt="Workspace" fill className="object-cover grayscale brightness-75" />
            <div className="absolute inset-0 flex items-center justify-center bg-primary/20 p-8 text-center">
              <p className="text-white font-mono text-xs uppercase font-bold">Story Management: 2026</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
