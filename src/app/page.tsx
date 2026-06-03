
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { 
  LayoutDashboard, 
  Headset, 
  Star, 
  Wrench, 
  CreditCard, 
  ArrowRight,
  CircleCheck,
  Sparkles,
  Smartphone,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

type Category = 'Reliability' | 'Support' | 'Testimonials' | 'Installation' | 'Billing';

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('Reliability');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  const supportStaff = [
    "Victoria Fokorede",
    "Aishat Hamzat",
    "Adekomoya Joseph",
    "Olusegun Oluwanishola",
    "Babatunde Christianah"
  ];

  const technicians = [
    "Lukmon Obasa (Akure)",
    "Christian Adejo (Akure)",
    "Habeeb Hussein (Ibadan)",
    "Joseph Dung N (Ibadan)",
    "Alowo Temitope (Ibadan)",
    "Timilehin Alabi (Ibadan)",
    "Adekunle Ademiju (Ibadan)",
    "Michael Awodein (Sagamu)",
    "Abiodun Kameyo (Sagamu)",
    "Adebisi Ogusola (Abeokuta)",
    "Kehinde Itehinola (Abeokuta)",
    "Olopade Olusegun (Abeokuta)",
    "Mubarak Raji (Osogbo)",
    "Inyene Udo (Ijebu Ode)",
    "Joseph Gbesoevi (Ota)"
  ];

  const categories = [
    { name: 'Reliability' as Category, icon: LayoutDashboard, label: 'Reliability' },
    { name: 'Support' as Category, icon: Headset, label: 'Support' },
    { name: 'Testimonials' as Category, icon: Star, label: 'Testimonials' },
    { name: 'Installation' as Category, icon: Wrench, label: 'Installation' },
    { name: 'Billing' as Category, icon: CreditCard, label: 'Billing' },
  ];

  const heroFiber = PlaceHolderImages.find(img => img.id === 'hero-fiber')!;
  const heroCustomer = PlaceHolderImages.find(img => img.id === 'hero-customer')!;
  const serverRoom = PlaceHolderImages.find(img => img.id === 'server-room')!;

  const handleRating = (key: string, val: number) => {
    setRatings(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTimeout(() => setIsSubmitted(false), 3000);
  };

  const renderRatingGroup = (id: string, label: string, description: string) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div>
        <h3 className="font-display text-2xl text-primary">{label}</h3>
        <p className="text-on-surface-variant text-sm">{description}</p>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((num) => (
          <button 
            key={num} 
            type="button"
            onClick={() => handleRating(id, num)}
            className={cn(
              "w-12 h-12 rounded-full border border-border flex items-center justify-center transition-all duration-200 font-mono",
              ratings[id] === num ? "bg-secondary text-white border-secondary scale-110" : "hover:bg-surface-container text-on-surface"
            )}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="canvas-bg min-h-screen font-body">
      <PublicNavbar />
      
      <main className="pt-32 pb-24">
        <section className="grid grid-cols-1 md:grid-cols-12 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto gap-gutter mb-24">
          <div className="md:col-span-7 flex flex-col justify-center">
            <h1 className="font-display text-display-xl mb-8 leading-[0.9] flex flex-wrap items-center gap-x-4">
              Experience 
              <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block">
                <Image src={heroFiber.imageUrl} alt={heroFiber.description} fill className="object-cover grayscale" data-ai-hint="fiber optics" />
              </div>
              seamless 
              <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block">
                <Image src={heroCustomer.imageUrl} alt={heroCustomer.description} fill className="object-cover" data-ai-hint="satisfied customer" />
              </div>
              connectivity.
            </h1>
            <div className="flex items-center gap-8 mt-4">
              <Button 
                size="lg" 
                className="bg-secondary text-white px-10 py-8 rounded-full font-bold text-body-lg hover:scale-[1.02] transition-transform duration-300"
                onClick={() => document.getElementById('feedback-portal')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Share Your Feedback
              </Button>
              <div className="h-px w-24 bg-border hidden md:block"></div>
            </div>
          </div>
          <div className="md:col-span-4 md:col-start-9 relative translate-y-16 hidden md:block">
            <div className="aspect-[3/4] bg-surface-container-high rounded-[2.5rem] overflow-hidden whisper-shadow relative">
              <Image src={serverRoom.imageUrl} alt={serverRoom.description} fill className="object-cover grayscale hover:grayscale-0 transition-all duration-1000" data-ai-hint="server room" />
            </div>
          </div>
        </section>

        <section id="feedback-portal" className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-12 whisper-shadow border border-border grid grid-cols-1 lg:grid-cols-12 gap-12">
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
                  <span className="font-mono text-label-mono">{cat.label}</span>
                </button>
              ))}
              
              <div className="mt-12 p-8 bg-surface-container-low rounded-2xl hidden lg:block">
                <Smartphone className="text-secondary w-12 h-12 mb-4" />
                <p className="font-body-md italic text-on-surface-variant">"Precision telemetry is the silent foundation of digital progress."</p>
              </div>
            </div>

            <div className="lg:col-span-8 lg:col-start-5">
              <form onSubmit={handleSubmit} className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Customer Name</label>
                    <input required className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="e.g. Adewale Sterling" type="text" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Customer ID</label>
                    <input required className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="IW-XXXX-XXXX" type="text" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Service Plan</label>
                    <select className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none">
                      <option>Fiber Enterprise 1Gbps</option>
                      <option>Fiber Home 500Mbps</option>
                      <option>Standard Residential</option>
                      <option>Dedicated SME Transit</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Region</label>
                    <select className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none">
                      <option>Lagos Metropolis</option>
                      <option>Abuja Capital</option>
                      <option>Abeokuta North</option>
                      <option>Ibadan Node</option>
                      <option>Akure Hub</option>
                      <option>Osogbo Office</option>
                      <option>Sagamu / Ota</option>
                    </select>
                  </div>
                </div>

                <div className="h-px w-full bg-surface-container-high my-12"></div>

                <div className="space-y-12">
                  {activeCategory === 'Reliability' && (
                    <>
                      {renderRatingGroup("stability", "Line Stability", "Rate your connection uptime over the last 30 days.")}
                      {renderRatingGroup("journey", "Journey Experience", "How seamless was your overall network journey today?")}
                      <div className="space-y-4">
                        <label className="font-mono text-[12px] uppercase text-on-surface-variant">Issue Category</label>
                        <select className="w-full bg-background p-4 rounded-xl border border-border focus:ring-2 focus:ring-secondary/20 outline-none">
                          <option>Speed & Latency</option>
                          <option>Staff Politeness</option>
                          <option>Total Downtime</option>
                          <option>Technical Error</option>
                        </select>
                      </div>
                    </>
                  )}

                  {activeCategory === 'Support' && (
                    <>
                      <div className="space-y-4">
                        <label className="font-mono text-[12px] uppercase text-on-surface-variant">Assigned Support Agent</label>
                        <select className="w-full bg-background p-4 rounded-xl border border-border focus:ring-2 focus:ring-secondary/20 outline-none">
                          <option disabled selected>Select Agent</option>
                          {supportStaff.map(staff => (
                            <option key={staff}>{staff}</option>
                          ))}
                        </select>
                      </div>
                      {renderRatingGroup("professionalism", "Technical Professionalism", "Evaluate the support agent's demeanor and command.")}
                      {renderRatingGroup("clarity", "Communication Clarity", "How clear were the explanations provided?")}
                      {renderRatingGroup("effectiveness", "Resolving Effectiveness", "Was your issue successfully resolved?")}
                      {renderRatingGroup("recommend", "Recommendation Likelihood", "Likelihood to recommend I-World based on this experience.")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-y border-border/30 py-8">
                        <div>
                          <h3 className="font-display text-xl">Timely Updates Provided?</h3>
                          <p className="text-on-surface-variant text-sm">Did you receive progress notifications?</p>
                        </div>
                        <div className="flex gap-4">
                           {['YES', 'NO'].map(choice => (
                             <button 
                               key={choice} 
                               type="button" 
                               onClick={() => handleRating('updates', choice === 'YES' ? 1 : 0)}
                               className={cn(
                                 "px-8 py-3 border border-border rounded-xl font-mono text-sm transition-all",
                                 (ratings['updates'] === 1 && choice === 'YES') || (ratings['updates'] === 0 && choice === 'NO')
                                  ? "bg-primary text-white" 
                                  : "hover:bg-surface-container"
                               )}
                             >
                               {choice}
                             </button>
                           ))}
                        </div>
                      </div>
                    </>
                  )}

                  {activeCategory === 'Testimonials' && (
                    <>
                      <div className="space-y-6">
                        <h3 className="font-display text-2xl">How does the signal feel?</h3>
                        <div className="flex gap-4">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star} 
                              onClick={() => handleRating('signal', star)}
                              className={cn(
                                "w-10 h-10 cursor-pointer transition-all",
                                (ratings['signal'] || 0) >= star ? "fill-secondary text-secondary" : "text-border hover:text-secondary/50"
                              )} 
                            />
                          ))}
                        </div>
                        <p className="font-mono text-xs text-on-surface-variant uppercase">Select Star Rating</p>
                      </div>
                      <div className="space-y-4">
                        <label className="font-display text-2xl block">Share your connection success story</label>
                        <textarea 
                          className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                          placeholder="The speed was transformative for our remote architecture studio..." 
                        />
                      </div>
                      <div className="space-y-6">
                        <h3 className="font-display text-2xl">Spotlight Interview?</h3>
                        <RadioGroup defaultValue="Maybe" className="flex gap-4">
                          {['Yes', 'No', 'Maybe'].map(opt => (
                            <div key={opt} className="flex items-center space-x-2 border p-4 rounded-xl flex-1 justify-center hover:bg-surface-container cursor-pointer transition-colors">
                              <RadioGroupItem value={opt} id={opt} />
                              <Label htmlFor={opt} className="cursor-pointer">{opt}</Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    </>
                  )}

                  {activeCategory === 'Installation' && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="font-mono text-[12px] uppercase text-on-surface-variant">Sales Representative</label>
                          <input className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="Full name" type="text" />
                        </div>
                        <div className="space-y-2">
                          <label className="font-mono text-[12px] uppercase text-on-surface-variant">Assigned Technician</label>
                          <select className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none">
                            <option disabled selected>Select Technician</option>
                            {technicians.map(tech => (
                              <option key={tech}>{tech}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {renderRatingGroup("punctuality", "Installation Punctuality", "Rate the arrival time of our technical team.")}
                      {renderRatingGroup("quality", "Installation Quality", "Evaluation of technical setup and cable management.")}
                    </>
                  )}

                  {activeCategory === 'Billing' && (
                    <>
                      {renderRatingGroup("accuracy", "Invoice Accuracy Rating", "Objective evaluation of recent financial statements.")}
                      {renderRatingGroup("dispute", "Dispute Resolution", "Effectiveness of revenue desk in resolving conflicts.")}
                      {renderRatingGroup("reconnection", "Reconnection Speed", "System response time for post-payment restoration.")}
                      <div className="p-8 bg-primary rounded-2xl text-white flex items-center justify-between">
                        <div>
                          <h4 className="font-display text-xl mb-1 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-secondary" />
                            Web Portal Invoice Tools
                          </h4>
                          <p className="opacity-70 text-sm">Utilized self-service billing tools this quarter?</p>
                        </div>
                        <Switch className="data-[state=checked]:bg-secondary" />
                      </div>
                    </>
                  )}

                  <div className="space-y-4">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Additional Comments</label>
                    <textarea 
                      className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                      placeholder="Your experience matters..." 
                    />
                  </div>

                  <div className="pt-6">
                    <Button 
                      disabled={isSubmitted}
                      className={cn(
                        "w-full md:w-auto px-12 py-7 rounded-full font-bold hover:scale-[1.02] transition-all flex items-center gap-4 text-white uppercase tracking-widest",
                        isSubmitted ? "bg-green-600" : "bg-primary"
                      )}
                    >
                      {isSubmitted ? (
                        <>
                          Evaluation Logged <CircleCheck className="w-5 h-5" />
                        </>
                      ) : (
                        <>
                          Submit Feedback <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-bright border-t border-border py-12">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4">
            <div className="font-mono text-label-mono font-bold text-primary uppercase">I-World Networks</div>
            <p className="text-on-surface-variant text-sm max-w-xs opacity-70">
              Delivering precision connectivity across Nigeria's leading commercial hubs.
            </p>
            <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-tighter">
              © 2024 I-World Networks. All rights reserved.
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-12 gap-y-4">
            {['Lagos', 'Ibadan', 'Abuja', 'Akure', 'Osogbo', 'Abeokuta', 'Privacy Policy', 'Terms of Service'].map(link => (
              <a key={link} className="text-on-surface-variant hover:text-secondary transition-colors font-mono text-label-mono" href="#">{link}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
