
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
  Smartphone,
  Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useFirestore } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

type Category = 'Reliability' | 'Support' | 'Testimonials' | 'Installation' | 'Billing';

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('Reliability');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    servicePlan: 'Standard Residential',
    location: 'Lagos',
    comment: '',
    staffName: '',
    interviewConsent: 'Maybe'
  });

  const firestore = useFirestore();

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
    { name: 'Reliability' as Category, icon: LayoutDashboard, label: 'Internet Quality' },
    { name: 'Support' as Category, icon: Headset, label: 'Customer Support' },
    { name: 'Testimonials' as Category, icon: Star, label: 'Share Your Story' },
    { name: 'Installation' as Category, icon: Wrench, label: 'Installation' },
    { name: 'Billing' as Category, icon: CreditCard, label: 'Payments & Billing' },
  ];

  const images = {
    fiber: PlaceHolderImages.find(img => img.id === 'hero-fiber')!,
    customer: PlaceHolderImages.find(img => img.id === 'hero-customer')!,
    server: PlaceHolderImages.find(img => img.id === 'server-room')!,
    tech: PlaceHolderImages.find(img => img.id === 'tech-samuel')!,
    workspace: PlaceHolderImages.find(img => img.id === 'workspace')!,
  };

  const heroContent: Record<Category, { title: React.ReactNode, sub: string, img: any }> = {
    Reliability: {
      title: (
        <>
          Experience <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.fiber.imageUrl} alt="fiber" fill className="object-cover grayscale" /></div> seamless <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> connectivity.
        </>
      ),
      sub: "Helping you stay connected to what matters most with reliable, high-speed fiber internet.",
      img: images.server
    },
    Support: {
      title: (
        <>
          Support Desk <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> service <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.tech.imageUrl} alt="tech" fill className="object-cover grayscale" /></div> evaluation.
        </>
      ),
      sub: "Your feedback helps us provide better technical assistance for your home or business.",
      img: images.tech
    },
    Testimonials: {
      title: (
        <>
          Share your <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> success <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.workspace.imageUrl} alt="workspace" fill className="object-cover grayscale" /></div> story.
        </>
      ),
      sub: "We love hearing how our internet has helped you achieve more at home or in the office.",
      img: images.workspace
    },
    Installation: {
      title: (
        <>
          Field <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.tech.imageUrl} alt="tech" fill className="object-cover" /></div> setup & <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.fiber.imageUrl} alt="fiber" fill className="object-cover grayscale" /></div> review.
        </>
      ),
      sub: "Help us ensure every customer gets a perfect start with our service and professional setup.",
      img: images.tech
    },
    Billing: {
      title: (
        <>
          Billing <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.workspace.imageUrl} alt="workspace" fill className="object-cover grayscale" /></div> feedback & <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> experience.
        </>
      ),
      sub: "We aim for clear, accurate, and easy payment experiences for all our customers.",
      img: images.server
    }
  };

  const activeHero = heroContent[activeCategory];

  const handleRating = (key: string, val: number) => {
    setRatings(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore) return;

    const feedbackRef = collection(firestore, 'feedbacks');
    addDoc(feedbackRef, {
      ...formData,
      category: activeCategory,
      ratings,
      timestamp: Date.now(),
      status: 'pending'
    });

    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setRatings({});
      setFormData({ ...formData, comment: '' });
    }, 3000);
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
        <section className="grid grid-cols-1 md:grid-cols-12 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto gap-gutter mb-24 min-h-[500px]">
          <div className="md:col-span-7 flex flex-col justify-center">
            <h1 className="font-display text-display-xl mb-8 leading-[0.9] flex flex-wrap items-center">
              {activeHero.title}
            </h1>
            <p className="text-on-surface-variant text-body-lg mb-10 max-w-lg">
              {activeHero.sub}
            </p>
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
              <Image 
                key={activeCategory}
                src={activeHero.img.imageUrl} 
                alt="Hero" 
                fill 
                className="object-cover grayscale hover:grayscale-0 transition-all duration-1000 animate-in fade-in zoom-in-95" 
                data-ai-hint={activeHero.img.imageHint} 
              />
            </div>
          </div>
        </section>

        <section id="feedback-portal" className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <div className="bg-surface-container-lowest rounded-[2.5rem] p-8 md:p-12 whisper-shadow border border-border grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-3 flex flex-col gap-2">
              <p className="font-mono text-label-mono text-on-surface-variant mb-6 uppercase tracking-widest">Select Category</p>
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
                <p className="font-body-md italic text-on-surface-variant">"Reliable internet is the foundation of your success."</p>
              </div>
            </div>

            <div className="lg:col-span-8 lg:col-start-5">
              <form onSubmit={handleSubmit} className="space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Full Name</label>
                    <input 
                      required 
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" 
                      placeholder="e.g. John Doe" 
                      type="text" 
                      value={formData.customerName}
                      onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Contact Email</label>
                    <div className="relative">
                      <Mail className="absolute right-0 bottom-3 w-4 h-4 text-on-surface-variant" />
                      <input 
                        required 
                        className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" 
                        placeholder="your@email.com" 
                        type="email" 
                        value={formData.customerEmail}
                        onChange={(e) => setFormData({...formData, customerEmail: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Current Plan</label>
                    <select 
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none"
                      value={formData.servicePlan}
                      onChange={(e) => setFormData({...formData, servicePlan: e.target.value})}
                    >
                      <option>Fiber Enterprise 1Gbps</option>
                      <option>Fiber Home 500Mbps</option>
                      <option>Standard Residential</option>
                      <option>Dedicated SME Transit</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Your Location</label>
                    <select 
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                    >
                      <option>Lagos</option>
                      <option>Abuja</option>
                      <option>Abeokuta</option>
                      <option>Ibadan</option>
                      <option>Akure</option>
                      <option>Osogbo</option>
                      <option>Sagamu / Ota</option>
                    </select>
                  </div>
                </div>

                <div className="h-px w-full bg-surface-container-high my-12"></div>

                <div className="space-y-12">
                  {activeCategory === 'Reliability' && (
                    <>
                      {renderRatingGroup("stability", "Connection Stability", "How stable was your internet over the last 30 days?")}
                      {renderRatingGroup("journey", "Overall Experience", "How would you rate your overall network experience today?")}
                      <div className="space-y-4">
                        <label className="font-mono text-[12px] uppercase text-on-surface-variant">Main Concern (if any)</label>
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
                        <label className="font-mono text-[12px] uppercase text-on-surface-variant">Assigned Agent</label>
                        <select 
                          className="w-full bg-background p-4 rounded-xl border border-border focus:ring-2 focus:ring-secondary/20 outline-none"
                          onChange={(e) => setFormData({...formData, staffName: e.target.value})}
                        >
                          <option disabled selected>Select Agent</option>
                          {supportStaff.map(staff => (
                            <option key={staff}>{staff}</option>
                          ))}
                        </select>
                      </div>
                      {renderRatingGroup("professionalism", "Agent Professionalism", "How helpful was the support agent?")}
                      {renderRatingGroup("clarity", "Communication Clarity", "Were the explanations easy to understand?")}
                      {renderRatingGroup("effectiveness", "Problem Resolution", "Was your issue fixed properly?")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-y border-border/30 py-8">
                        <div>
                          <h3 className="font-display text-xl">Were you kept updated?</h3>
                          <p className="text-on-surface-variant text-sm">Did you receive updates about your request?</p>
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
                        <h3 className="font-display text-2xl">Overall Rating</h3>
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
                      </div>
                      <div className="space-y-4">
                        <label className="font-display text-2xl block">Share your story</label>
                        <textarea 
                          className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                          placeholder="How has our service helped your work or home life?" 
                          value={formData.comment}
                          onChange={(e) => setFormData({...formData, comment: e.target.value})}
                        />
                      </div>
                      <div className="space-y-6">
                        <h3 className="font-display text-2xl">Can we share your story?</h3>
                        <p className="text-sm text-on-surface-variant mb-4">We'd love to feature your experience in our updates.</p>
                        <RadioGroup 
                          defaultValue="Maybe" 
                          className="flex gap-4"
                          onValueChange={(val) => setFormData({...formData, interviewConsent: val})}
                        >
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
                          <label className="font-mono text-[12px] uppercase text-on-surface-variant">Sales Agent Name</label>
                          <input className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0" placeholder="Agent Name" type="text" />
                        </div>
                        <div className="space-y-2">
                          <label className="font-mono text-[12px] uppercase text-on-surface-variant">Technician Name</label>
                          <select 
                            className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none"
                            onChange={(e) => setFormData({...formData, staffName: e.target.value})}
                          >
                            <option disabled selected>Select Technician</option>
                            {technicians.map(tech => (
                              <option key={tech}>{tech}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {renderRatingGroup("punctuality", "On-Time Arrival", "Did our team arrive when scheduled?")}
                      {renderRatingGroup("quality", "Setup Quality", "How would you rate the neatness of the setup?")}
                    </>
                  )}

                  {activeCategory === 'Billing' && (
                    <>
                      {renderRatingGroup("accuracy", "Invoice Accuracy", "How accurate was your last bill?")}
                      {renderRatingGroup("dispute", "Dispute Resolution", "How helpful was our team with billing questions?")}
                      {renderRatingGroup("reconnection", "Reconnection Speed", "How fast was service restored after payment?")}
                      <div className="p-8 bg-primary rounded-2xl text-white flex items-center justify-between">
                        <div>
                          <h4 className="font-display text-xl mb-1">Self-Service Portal</h4>
                          <p className="opacity-70 text-sm">Did you use our online portal for payments?</p>
                        </div>
                        <Switch className="data-[state=checked]:bg-secondary" />
                      </div>
                    </>
                  )}

                  {activeCategory !== 'Testimonials' && (
                    <div className="space-y-4">
                      <label className="font-mono text-[12px] uppercase text-on-surface-variant">Anything else?</label>
                      <textarea 
                        className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                        placeholder="Tell us how we can improve..." 
                        value={formData.comment}
                        onChange={(e) => setFormData({...formData, comment: e.target.value})}
                      />
                    </div>
                  )}

                  <div className="pt-6">
                    <Button 
                      type="submit"
                      disabled={isSubmitted}
                      className={cn(
                        "w-full md:w-auto px-12 py-7 rounded-full font-bold hover:scale-[1.02] transition-all flex items-center gap-4 text-white uppercase tracking-widest",
                        isSubmitted ? "bg-green-600" : "bg-primary"
                      )}
                    >
                      {isSubmitted ? (
                        <>
                          Thank You <CircleCheck className="w-5 h-5" />
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
              Reliable fiber internet for Nigeria's major business hubs.
            </p>
            <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-tighter">
              © 2024 I-World Networks.
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-12 gap-y-4">
            {['Lagos', 'Ibadan', 'Abuja', 'Akure', 'Osogbo', 'Abeokuta', 'Privacy', 'Terms'].map(link => (
              <a key={link} className="text-on-surface-variant hover:text-secondary transition-colors font-mono text-label-mono" href="#">{link}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
