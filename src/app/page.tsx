
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { LayoutDashboard, Headset, Star, Wrench, CreditCard, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState('Reliability');

  const categories = [
    { name: 'Reliability', icon: LayoutDashboard },
    { name: 'Support', icon: Headset },
    { name: 'Testimonials', icon: Star },
    { name: 'Installation', icon: Wrench },
    { name: 'Billing', icon: CreditCard },
  ];

  const heroFiber = PlaceHolderImages.find(img => img.id === 'hero-fiber')!;
  const heroCustomer = PlaceHolderImages.find(img => img.id === 'hero-customer')!;
  const serverRoom = PlaceHolderImages.find(img => img.id === 'server-room')!;

  return (
    <div className="canvas-bg">
      <PublicNavbar />
      
      <main className="pt-32 pb-24">
        {/* Hero Section */}
        <section className="grid grid-cols-1 md:grid-cols-12 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto gap-gutter mb-24">
          <div className="md:col-span-7 flex flex-col justify-center">
            <h1 className="font-display text-display-xl mb-8 leading-[0.9] flex flex-wrap items-center gap-x-4">
              Experience 
              <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block">
                <Image 
                  src={heroFiber.imageUrl} 
                  alt={heroFiber.description} 
                  fill 
                  className="object-cover"
                  data-ai-hint={heroFiber.imageHint}
                />
              </div>
              seamless 
              <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block">
                <Image 
                  src={heroCustomer.imageUrl} 
                  alt={heroCustomer.description} 
                  fill 
                  className="object-cover"
                  data-ai-hint={heroCustomer.imageHint}
                />
              </div>
              connectivity.
            </h1>
            <div className="flex items-center gap-8 mt-4">
              <Button size="lg" className="bg-secondary text-white px-10 py-8 rounded-full font-bold text-body-lg hover:scale-[1.02] transition-transform duration-300">
                Share Your Feedback
              </Button>
              <div className="h-px w-24 bg-border hidden md:block"></div>
            </div>
          </div>
          <div className="md:col-span-4 md:col-start-9 relative translate-y-16 hidden md:block">
            <div className="aspect-[3/4] bg-surface-container-high rounded-[2.5rem] overflow-hidden whisper-shadow relative">
              <Image 
                src={serverRoom.imageUrl} 
                alt={serverRoom.description} 
                fill 
                className="object-cover grayscale hover:grayscale-0 transition-all duration-1000"
                data-ai-hint={serverRoom.imageHint}
              />
            </div>
          </div>
        </section>

        {/* Form Area */}
        <section className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-12 whisper-shadow border border-border grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Sidebar Tab Selector */}
            <div className="lg:col-span-3 flex flex-col gap-2">
              <p className="font-mono text-label-mono text-on-surface-variant mb-6 uppercase tracking-widest">Feedback Categories</p>
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(cat.name)}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4 rounded-xl transition-all text-left group",
                    activeCategory === cat.name ? "active-tab" : "text-on-surface-variant hover:bg-surface-container"
                  )}
                >
                  <cat.icon className={cn("w-5 h-5", activeCategory === cat.name ? "text-secondary" : "group-hover:text-secondary")} />
                  <span className="font-mono text-label-mono">{cat.name}</span>
                </button>
              ))}
            </div>

            {/* Main Form Canvas */}
            <div className="lg:col-span-8 lg:col-start-5">
              <div className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Customer Name</label>
                    <input className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="e.g. Adewale Chen" type="text" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Customer ID</label>
                    <input className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="IW-90082" type="text" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Service Plan</label>
                    <select className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none">
                      <option>Home</option>
                      <option>Business</option>
                      <option>Enterprise</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Region</label>
                    <select className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none">
                      <option>Lagos</option>
                      <option>Abuja</option>
                      <option>Abeokuta</option>
                    </select>
                  </div>
                </div>

                <div className="h-px w-full bg-surface-container-high my-12"></div>

                <div className="space-y-12">
                   <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="font-display text-2xl">Network Stability</h3>
                      <p className="text-on-surface-variant">Rate your connection uptime over the last 30 days.</p>
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button key={num} className={cn("w-12 h-12 rounded-full border border-border flex items-center justify-center hover:bg-secondary hover:text-white transition-colors", num === 5 && "bg-secondary text-white border-secondary")}>
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Additional Comments</label>
                    <textarea 
                      className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                      placeholder="Your experience matters..." 
                    />
                  </div>

                  <div className="pt-6">
                    <Button className="w-full md:w-auto px-12 py-7 bg-primary text-white rounded-full font-bold hover:scale-[1.02] transition-transform flex items-center gap-4">
                      Submit Feedback
                      <ArrowRight className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-bright border-t border-border py-12">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4">
            <div className="font-mono text-label-mono font-bold text-primary">I-World Networks</div>
            <p className="text-on-surface-variant text-sm max-w-xs opacity-70">
              Delivering precision connectivity across Nigeria's leading commercial hubs.
            </p>
            <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-tighter">
              © 2024 I-World Networks. All rights reserved.
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-12 gap-y-4">
            {['Lagos', 'Abuja', 'Abeokuta', 'Privacy Policy', 'Terms of Service'].map(link => (
              <a key={link} className="text-on-surface-variant hover:text-secondary transition-colors font-mono text-label-mono" href="#">{link}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
