
'use client';

import React, { useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Star, Copy, Check, Info } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function AdminTestimonials() {
  const [filter, setFilter] = useState<'home' | 'business'>('home');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const workspaceImg = PlaceHolderImages.find(img => img.id === 'workspace')!;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const testimonials = [
    {
      id: '1',
      type: 'home',
      stars: 5,
      tag: 'Home Fiber',
      quote: "The low latency was a game changer for my competitive gaming sessions. I-World is truly in a league of its own in Lagos.",
      author: 'Oluwaseun Adeyemi',
      loc: 'Lekki, Lagos'
    },
    {
      id: '2',
      type: 'home',
      stars: 4.5,
      tag: 'Smart Home',
      quote: "Installation was seamless. The technician walked me through the entire mesh setup. Incredible customer service.",
      author: 'Amaka Obi',
      loc: 'Garki, Abuja'
    },
    {
      id: '3',
      type: 'home',
      stars: 5,
      tag: 'Home 100+',
      quote: "The reliability is what sets them apart. I've had zero downtime during my remote work hours since switching last year.",
      author: 'Chidi Nwosu',
      loc: 'Abeokuta'
    }
  ];

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <h1 className="text-primary mb-4 font-display text-display-lg tracking-tight">Curated Feedback</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">High-performance narratives for marketing collateral. One-click copy for social amplification.</p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex items-end">
          <div className="border border-border bg-white rounded-full p-1 flex w-full">
            <button 
              onClick={() => setFilter('home')}
              className={cn("flex-1 py-2 rounded-full font-mono text-label-mono transition-all", filter === 'home' ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Home
            </button>
            <button 
              onClick={() => setFilter('business')}
              className={cn("flex-1 py-2 rounded-full font-mono text-label-mono transition-all", filter === 'business' ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Business
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start mb-24">
        <div className="md:col-span-7 space-y-8">
          {testimonials.slice(0, 2).map((item) => (
            <div key={item.id} className="bg-white border border-border p-8 rounded-xl whisper-shadow group">
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-1 text-secondary">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={cn("w-5 h-5", i < item.stars ? "fill-secondary text-secondary" : "text-border")} />
                  ))}
                </div>
                <span className="font-mono uppercase text-secondary text-sm tracking-widest opacity-60">{item.tag}</span>
              </div>
              <blockquote className="text-primary leading-tight mb-8 font-display text-[32px] font-bold italic">
                "{item.quote}"
              </blockquote>
              <div className="flex justify-between items-end">
                <div>
                  <p className="font-mono text-label-mono font-bold">{item.author}</p>
                  <p className="text-on-surface-variant text-sm font-mono text-xs opacity-60">{item.loc}</p>
                </div>
                <Button 
                  onClick={() => handleCopy(item.id, item.quote)}
                  className="bg-primary text-white px-6 py-6 rounded-full font-mono flex items-center gap-2 hover:scale-105 transition-transform active:scale-95 text-label-mono"
                >
                  {copiedId === item.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedId === item.id ? 'Copied!' : 'Copy for Social'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-5 space-y-8 md:pt-16">
          <div className="bg-surface-container-highest border border-border p-8 rounded-xl whisper-shadow group">
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-1 text-secondary">
                <Star className="w-5 h-5 fill-secondary text-secondary" />
                <Star className="w-5 h-5 fill-secondary text-secondary" />
                <Star className="w-5 h-5 fill-secondary text-secondary" />
                <Star className="w-5 h-5 fill-secondary text-secondary" />
                <Star className="w-5 h-5 fill-secondary text-secondary" />
              </div>
              <span className="font-mono uppercase text-secondary text-sm tracking-widest opacity-60">{testimonials[2].tag}</span>
            </div>
            <blockquote className="text-primary mb-8 font-body-lg">
              "{testimonials[2].quote}"
            </blockquote>
            <div className="flex justify-between items-end">
              <div>
                <p className="font-mono text-label-mono font-bold">{testimonials[2].author}</p>
                <p className="text-on-surface-variant text-sm font-mono text-xs opacity-60">{testimonials[2].loc}</p>
              </div>
              <Button 
                onClick={() => handleCopy(testimonials[2].id, testimonials[2].quote)}
                className="bg-primary text-white px-6 py-6 rounded-full font-mono flex items-center gap-2 hover:scale-105 transition-transform text-label-mono"
              >
                {copiedId === testimonials[2].id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedId === testimonials[2].id ? 'Copied!' : 'Copy for Social'}
              </Button>
            </div>
          </div>
          
          <div className="w-full h-80 relative rounded-xl overflow-hidden grayscale contrast-125">
            <Image 
              src={workspaceImg.imageUrl} 
              alt="Tech workspace" 
              fill 
              className="object-cover opacity-60"
              data-ai-hint={workspaceImg.imageHint}
            />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
