
'use client';

import React, { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Star, Copy, Check, Sparkles, UserCheck } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useFirestore, useCollection, useAuth, useUser } from '@/firebase';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';

export default function AdminTestimonials() {
  const [filter, setFilter] = useState<'Home' | 'Business' | 'Spotlight'>('Home');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const workspaceImg = PlaceHolderImages.find(img => img.id === 'workspace')!;
  const firestore = useFirestore();
  const auth = useAuth();
  const { user } = useUser(auth);

  const testimonialQuery = useMemo(() => {
    if (!firestore || !user || !user.emailVerified || !user.email?.endsWith('@iworldnetworks.net')) return null;
    return query(collection(firestore, 'feedbacks'), where('category', '==', 'Testimonials'), orderBy('timestamp', 'desc'), limit(100));
  }, [firestore, user]);

  const { data: testimonials } = useCollection(testimonialQuery);

  const stats = useMemo(() => {
    if (!testimonials) return { referrals: {}, spotlightCount: 0 };
    const referrals: Record<string, number> = {};
    let spotlightCount = 0;
    testimonials.forEach((t: any) => {
      const source = t.referralSource || 'Unknown';
      referrals[source] = (referrals[source] || 0) + 1;
      if (t.spotlightInterview === 'Yes') spotlightCount++;
    });
    return { referrals, spotlightCount };
  }, [testimonials]);

  const filteredTestimonials = useMemo(() => {
    if (!testimonials) return [];
    return testimonials.filter((t: any) => {
      const plan = t.servicePlan || '';
      if (filter === 'Home') return plan.startsWith('H-');
      if (filter === 'Business') return plan.startsWith('U-');
      if (filter === 'Spotlight') return t.spotlightInterview === 'Yes' || t.spotlightInterview === 'Maybe';
      return true;
    });
  }, [testimonials, filter]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="text-primary mb-4 font-display text-3xl md:text-display-lg tracking-tight uppercase font-black">Success Stories</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">Curate high-impact testimonials for marketing and identify potential customer advocates for regional spotlight interviews.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-16">
        <div className="md:col-span-8 space-y-6">
          <div className="flex border-b border-border mb-8 overflow-x-auto scrollbar-hide">
            {[
              { id: 'Home', label: 'Residential (H-Series)' },
              { id: 'Business', label: 'Corporate (U-Series)' },
              { id: 'Spotlight', label: 'Advocate Queue', icon: Sparkles }
            ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setFilter(tab.id as any)} 
                className={cn(
                  "px-8 py-4 font-mono text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 whitespace-nowrap", 
                  filter === tab.id ? "border-b-2 border-secondary text-secondary font-bold" : "text-on-surface-variant"
                )}
              >
                {tab.icon && <tab.icon className="w-3 h-3" />}
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-6">
            {filteredTestimonials.map((item: any) => (
              <div key={item.id} className="bg-white border border-border p-8 rounded-xl whisper-shadow relative group hover:border-secondary transition-all">
                {item.spotlightInterview === 'Yes' && (
                  <div className="absolute -top-3 -right-3 bg-secondary text-white px-4 py-1 rounded-full text-[10px] font-mono font-bold shadow-lg flex items-center gap-2 z-10">
                    <UserCheck className="w-3 h-3" /> Spotlight Ready
                  </div>
                )}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={cn("w-4 h-4", i < (item.ratings?.signal || 5) ? "fill-secondary text-secondary" : "text-border")} />
                    ))}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-[10px] uppercase text-secondary font-bold">{item.referralSource || 'Unknown'} Referral</span>
                    <span className="font-mono text-[8px] uppercase text-on-surface-variant/40 mt-1">{new Date(item.timestamp).toLocaleDateString()}</span>
                  </div>
                </div>
                <blockquote className="text-primary leading-tight mb-8 font-display text-2xl font-bold italic">
                  "{item.comment}"
                </blockquote>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-t border-border/50 pt-6 gap-6">
                  <div>
                    <p className="font-mono text-xs font-bold text-primary">{item.customerName}</p>
                    <p className="text-on-surface-variant text-[10px] font-mono opacity-60 uppercase">{item.location} Hub • {item.servicePlan}</p>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={() => handleCopy(item.id, item.comment)} size="sm" className="flex-1 sm:flex-none bg-primary text-white rounded-full font-mono text-[10px] px-6 uppercase font-bold">
                      {copiedId === item.id ? <Check className="w-3 h-3 mr-2" /> : <Copy className="w-3 h-3 mr-2" />}
                      {copiedId === item.id ? 'Copied' : 'Copy Text'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {filteredTestimonials.length === 0 && (
              <div className="text-center py-24 bg-white border border-dashed border-border rounded-xl">
                <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">No Stories Found in this Node</p>
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-4 space-y-6">
          <div className="bg-primary text-white p-8 rounded-xl shadow-2xl relative overflow-hidden group">
            <Sparkles className="absolute -bottom-4 -right-4 w-24 h-24 text-white/10 group-hover:scale-125 transition-transform duration-700" />
            <h4 className="font-mono text-[10px] uppercase tracking-widest mb-4 opacity-60 font-bold">Marketing Intelligence</h4>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[56px] font-mono font-black">{stats.spotlightCount}</span>
              <span className="text-sm font-display font-bold">Advocates</span>
            </div>
            <p className="text-[10px] font-mono opacity-70 leading-relaxed uppercase font-bold">Customers ready for spotlight features in {new Date().getFullYear()}.</p>
          </div>

          <div className="bg-white border border-border p-8 rounded-xl whisper-shadow">
            <h4 className="font-mono text-[10px] uppercase tracking-widest mb-6 text-secondary font-bold">Lead Source Breakdown</h4>
            <div className="space-y-4">
              {Object.entries(stats.referrals).map(([source, count]: any) => (
                <div key={source} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                  <span className="text-[10px] font-mono uppercase font-bold text-on-surface-variant">{source}</span>
                  <span className="bg-muted px-3 py-1 rounded-full text-[10px] font-black text-primary">{count}</span>
                </div>
              ))}
              {Object.keys(stats.referrals).length === 0 && (
                <p className="text-[10px] font-mono opacity-40 text-center py-4">Waiting for telemetry...</p>
              )}
            </div>
          </div>
          
          <div className="relative h-64 rounded-xl overflow-hidden grayscale brightness-50 contrast-125 group">
            <Image 
              src={workspaceImg.imageUrl} 
              alt="Engagement Hub" 
              fill 
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 33vw"
              className="object-cover group-hover:scale-110 transition-transform duration-1000" 
            />
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center border-4 border-white/20 m-4 rounded-lg">
              <p className="text-white font-mono text-[10px] uppercase font-bold tracking-widest">Regional Growth Hub v2.6</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
