'use client';

import React, { useState, useMemo } from 'react';
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
import { useFirestore, useCollection } from '@/firebase';
import { collection, addDoc, query, orderBy } from 'firebase/firestore';

type Category = 'Reliability' | 'Support' | 'Testimonials' | 'Installation' | 'Billing';

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('Reliability');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    servicePlan: 'Standard Home',
    location: 'Lagos',
    comment: '',
    staffName: '',
    interviewConsent: 'Maybe'
  });

  const firestore = useFirestore();

  // Fetch real staff and technicians from Firestore
  const staffQuery = useMemo(() => firestore ? query(collection(firestore, 'staff'), orderBy('name')) : null, [firestore]);
  const techQuery = useMemo(() => firestore ? query(collection(firestore, 'technicians'), orderBy('name')) : null, [firestore]);
  
  const { data: supportStaff } = useCollection(staffQuery);
  const { data: technicians } = useCollection(techQuery);

  const categories = [
    { name: 'Reliability' as Category, icon: LayoutDashboard, label: 'Internet Quality' },
    { name: 'Support' as Category, icon: Headset, label: 'Customer Support' },
    { name: 'Testimonials' as Category, icon: Star, label: 'Share Your Story' },
    { name: 'Installation' as Category, icon: Wrench, label: 'Setup Experience' },
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
          Get <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill className="object-cover" /></div> consistent <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> connections.
        </>
      ),
      sub: "We're committed to keeping you online with high-speed fiber you can count on every day.",
      img: images.server
    },
    Support: {
      title: (
        <>
          Friendly <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> help <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill className="object-cover grayscale" /></div> when you need it.
        </>
      ),
      sub: "Tell us how our support team did today so we can keep improving our service for you.",
      img: images.tech
    },
    Testimonials: {
      title: (
        <>
          Share your <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> personal <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill className="object-cover grayscale" /></div> success story.
        </>
      ),
      sub: "How has our internet helped your home or business reach new goals? We'd love to know.",
      img: images.workspace
    },
    Installation: {
      title: (
        <>
          Professional <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill className="object-cover" /></div> setup <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill className="object-cover grayscale" /></div> review.
        </>
      ),
      sub: "We want every installation to be perfect. Let us know how your setup experience went.",
      img: images.tech
    },
    Billing: {
      title: (
        <>
          Simple <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill className="object-cover grayscale" /></div> payments <div className="relative h-[72px] w-[140px] rounded-full overflow-hidden inline-block mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill className="object-cover" /></div> feedback.
        </>
      ),
      sub: "We aim for clear and easy billing. Tell us about your experience with our payment tools.",
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
                alt="Feedback category" 
                fill 
                className="object-cover grayscale hover:grayscale-0 transition-all duration-1000 animate-in fade-in zoom-in-95" 
                data-ai-hint="professional service" 
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
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 outline-none" 
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
                        className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 outline-none" 
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
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none outline-none"
                      value={formData.servicePlan}
                      onChange={(e) => setFormData({...formData, servicePlan: e.target.value})}
                    >
                      <option>Fiber Enterprise 1Gbps</option>
                      <option>Fiber Home 500Mbps</option>
                      <option>Standard Home</option>
                      <option>Dedicated SME</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[12px] uppercase text-on-surface-variant">Your Location</label>
                    <select 
                      className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none outline-none"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                    >
                      <option>Lagos</option>
                      <option>Abuja</option>
                      <option>Abeokuta</option>
                      <option>Ibadan</option>
                      <option>Akure</option>
                      <option>Osogbo</option>
                      <option>Sagamu</option>
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
                          <option>None / Everything is great</option>
                          <option>Speed & Latency</option>
                          <option>Wait times</option>
                          <option>Connection drops</option>
                          <option>Technical Error</option>
                        </select>
                      </div>
                    </>
                  )}

                  {activeCategory === 'Support' && (
                    <>
                      <div className="space-y-4">
                        <label className="font-mono text-[12px] uppercase text-on-surface-variant">Who helped you?</label>
                        <select 
                          className="w-full bg-background p-4 rounded-xl border border-border focus:ring-2 focus:ring-secondary/20 outline-none"
                          onChange={(e) => setFormData({...formData, staffName: e.target.value})}
                          required
                        >
                          <option value="">Select Agent</option>
                          {supportStaff?.map((staff: any) => (
                            <option key={staff.id} value={staff.name}>{staff.name}</option>
                          ))}
                        </select>
                      </div>
                      {renderRatingGroup("professionalism", "Helpfulness", "How helpful was our support agent?")}
                      {renderRatingGroup("clarity", "Communication", "Were the explanations easy to understand?")}
                      {renderRatingGroup("effectiveness", "Problem Resolution", "Was your issue fixed properly?")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-y border-border/30 py-8">
                        <div>
                          <h3 className="font-display text-xl">Were you kept updated?</h3>
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
                          required
                        />
                      </div>
                      <div className="space-y-6">
                        <h3 className="font-display text-2xl">Can we share your story?</h3>
                        <p className="text-sm text-on-surface-variant mb-4">We'd love to feature your experience on our website.</p>
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
                          <input className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 outline-none" placeholder="Who sold you the plan?" type="text" />
                        </div>
                        <div className="space-y-2">
                          <label className="font-mono text-[12px] uppercase text-on-surface-variant">Installation Lead</label>
                          <select 
                            className="w-full bg-transparent border-0 border-b border-border focus:ring-0 focus:border-secondary font-body py-2 px-0 appearance-none outline-none"
                            onChange={(e) => setFormData({...formData, staffName: e.target.value})}
                            required
                          >
                            <option value="">Select Technician</option>
                            {technicians?.map((tech: any) => (
                              <option key={tech.id} value={tech.name}>{tech.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {renderRatingGroup("punctuality", "Punctuality", "Did our team arrive when they said they would?")}
                      {renderRatingGroup("quality", "Setup Quality", "How would you rate the neatness of the setup?")}
                    </>
                  )}

                  {activeCategory === 'Billing' && (
                    <>
                      {renderRatingGroup("accuracy", "Invoice Accuracy", "How accurate was your last bill?")}
                      {renderRatingGroup("dispute", "Helpfulness", "How helpful was our team with billing questions?")}
                      {renderRatingGroup("reconnection", "Reconnection Speed", "How fast was service restored after payment?")}
                      <div className="p-8 bg-primary rounded-2xl text-white flex items-center justify-between">
                        <div>
                          <h4 className="font-display text-xl mb-1">Online Payment Portal</h4>
                          <p className="opacity-70 text-sm">Did you use our website portal for payments?</p>
                        </div>
                        <Switch className="data-[state=checked]:bg-secondary" />
                      </div>
                    </>
                  )}

                  {activeCategory !== 'Testimonials' && (
                    <div className="space-y-4">
                      <label className="font-mono text-[12px] uppercase text-on-surface-variant">Additional Comments</label>
                      <textarea 
                        className="w-full bg-background p-6 rounded-[1.5rem] border border-border focus:ring-2 focus:ring-secondary/20 outline-none resize-none min-h-[160px]" 
                        placeholder="Tell us anything else you'd like us to know..." 
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
              Reliable fiber internet for Nigeria's leading business hubs.
            </p>
            <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-tighter">
              © 2024 I-World Networks.
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-12 gap-y-4">
            {['Lagos', 'Ibadan', 'Abuja', 'Akure', 'Osogbo', 'Sagamu', 'Abeokuta', 'Privacy', 'Terms'].map(link => (
              <a key={link} className="text-on-surface-variant hover:text-secondary transition-colors font-mono text-label-mono" href="#">{link}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
