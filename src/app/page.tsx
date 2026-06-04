
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
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useFirestore } from '@/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { analyzeCustomerFeedbackSentiment } from '@/ai/flows/analyze-customer-feedback-sentiment';

type Category = 'Reliability' | 'Support' | 'Testimonials' | 'Installation' | 'Billing';

export default function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('Reliability');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ratings, setRatings] = useState<Record<string, any>>({});
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    servicePlan: 'H-Pro',
    location: 'Abeokuta',
    comment: '',
    staffName: '',
    referralSource: 'Social Media'
  });

  const firestore = useFirestore();
  const validRegions = ['Abeokuta', 'Ibadan', 'Osogbo', 'Akure'];

  const residentialPlans = ['H-Lite', 'H-Pro', 'H-Max', 'H-Custom'];
  const businessPlans = ['U-Lite', 'U-Pro', 'U-Max', 'U-Custom'];

  const supportStaff = ["Victoria Fokorede", "Aishat Hamzat", "Adekomoya Joseph", "Olusegun Oluwanishola", "Babatunde Christianah"];
  const technicians = [
    { name: "Lukmon Obasa", region: "Akure" },
    { name: "Christian Adejo", region: "Akure" },
    { name: "Habeeb Hussein", region: "Ibadan" },
    { name: "Joseph Dung N", region: "Ibadan" },
    { name: "Alowo Temitope", region: "Ibadan" },
    { name: "Timilehin Alabi", region: "Ibadan" },
    { name: "Adekunle Ademiju", region: "Ibadan" },
    { name: "Adebisi Ogusola", region: "Abeokuta" },
    { name: "Kehinde Itehinola", region: "Abeokuta" },
    { name: "Olopade Olusegun", region: "Abeokuta" },
    { name: "Mubarak Raji", region: "Osogbo" }
  ];

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
      title: (<>Stay <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Connected <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Always.</>),
      sub: "Help us monitor your internet quality. We want to ensure you have consistent high-speed fiber every single day.",
      img: images.server
    },
    Support: {
      title: (<>Fast <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Answers <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Locally.</>),
      sub: "How was your experience with our support team? We're here to help and value your honest feedback.",
      img: images.tech
    },
    Testimonials: {
      title: (<>Real <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Stories <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Shared.</>),
      sub: "Has I-World helped your home or business? Share your success story with us and the community.",
      img: images.workspace
    },
    Installation: {
      title: (<>Professional <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Fiber <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Setup.</>),
      sub: "Tell us about your installation. We aim for a neat, quick, and professional experience every time.",
      img: images.tech
    },
    Billing: {
      title: (<>Simple <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Payments <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="(max-width: 768px) 50px, 100px" className="object-cover" /></div> Matter.</>),
      sub: "How is our payment process? We want to make sure the billing cycle is easy and clear for everyone.",
      img: images.server
    }
  };

  const handleRating = (key: string, val: any) => {
    setRatings(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firestore || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // 1. AI Sentiment Analysis
      let aiAnalysis = null;
      if (formData.comment) {
        try {
          aiAnalysis = await analyzeCustomerFeedbackSentiment({ feedbackText: formData.comment });
        } catch (err) {
          console.error('AI Sentiment Analysis failed', err);
        }
      }

      // 2. Prepare Data
      const feedbackData = {
        ...formData,
        category: activeCategory,
        ratings,
        timestamp: Date.now(),
        status: 'pending',
        aiSentiment: aiAnalysis?.sentiment || 'neutral',
        aiThemes: aiAnalysis?.keyThemes || []
      };

      // 3. Save to Firestore
      const feedbackRef = collection(firestore, 'feedbacks');
      await addDoc(feedbackRef, feedbackData);

      setIsSubmitted(true);
      setTimeout(() => {
        setIsSubmitted(false);
        setRatings({});
        setFormData({ ...formData, comment: '', customerEmail: '', customerName: '' });
      }, 3000);
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: 'feedbacks',
        operation: 'create',
      });
      errorEmitter.emit('permission-error', permissionError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRatingGroup = (id: string, label: string, description: string) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6 border-b border-border/50 last:border-0">
      <div className="max-w-md">
        <h3 className="font-display text-lg text-primary font-bold">{label}</h3>
        <p className="text-on-surface-variant text-xs">{description}</p>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((num) => (
          <button 
            key={num} 
            type="button"
            onClick={() => handleRating(id, num)}
            className={cn(
              "w-10 h-10 rounded-full border border-border flex items-center justify-center transition-all duration-200 font-mono text-[10px] font-bold",
              ratings[id] === num ? "bg-secondary text-white border-secondary" : "hover:bg-surface-container text-on-surface"
            )}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="canvas-bg min-h-screen font-body overflow-x-hidden">
      <PublicNavbar />
      <main className="pt-24 md:pt-32 pb-24">
        <section className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-24">
          <div className="lg:col-span-7">
            <h1 className="font-display text-[40px] md:text-display-lg mb-6 leading-tight flex flex-wrap items-center">
              {heroContent[activeCategory].title}
            </h1>
            <p className="text-on-surface-variant text-sm md:text-body-lg mb-8 max-w-lg">
              {heroContent[activeCategory].sub}
            </p>
            <Button size="lg" className="bg-secondary text-white px-10 py-7 rounded-full font-bold hover:scale-105 transition-transform uppercase text-[12px] tracking-widest" onClick={() => document.getElementById('feedback-portal')?.scrollIntoView({ behavior: 'smooth' })}>
              Share Your Feedback
            </Button>
          </div>
        </section>

        <section id="feedback-portal" className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <div className="bg-white rounded-3xl p-6 md:p-12 whisper-shadow border border-border grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-3">
              <p className="font-mono text-[10px] uppercase text-on-surface-variant mb-6 tracking-widest font-bold">Feedback Category</p>
              <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto pb-4 lg:pb-0 scrollbar-hide">
                {categories.map((cat) => (
                  <button key={cat.name} onClick={() => { setActiveCategory(cat.name); setRatings({}); }} className={cn("flex items-center gap-4 px-6 py-4 rounded-xl transition-all text-left whitespace-nowrap", activeCategory === cat.name ? "bg-secondary text-white shadow-lg" : "text-on-surface-variant hover:bg-surface-container font-bold")}>
                    <cat.icon className="w-5 h-5" />
                    <span className="font-mono text-[10px] uppercase tracking-wider">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-9">
              <form onSubmit={handleSubmit} className="space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Your Name</label>
                    <input required className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" placeholder="e.g. John Doe" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Contact Email</label>
                    <input required type="email" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" placeholder="your@email.com" value={formData.customerEmail} onChange={e => setFormData({...formData, customerEmail: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Service Region</label>
                    <select className="w-full bg-transparent border-b border-border py-2 outline-none cursor-pointer font-bold" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}>
                      {validRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Service Plan</label>
                    <select className="w-full bg-transparent border-b border-border py-2 outline-none cursor-pointer font-bold" value={formData.servicePlan} onChange={e => setFormData({...formData, servicePlan: e.target.value})}>
                      <optgroup label="Residential (H-Series)">
                        {residentialPlans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </optgroup>
                      <optgroup label="Business (U-Series)">
                        {businessPlans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className="space-y-8">
                  {activeCategory === 'Reliability' && (
                    <>
                      {renderRatingGroup("stability", "Network Stability", "How stable has your connection been over the last 30 days?")}
                      {renderRatingGroup("latency", "Speed & Latency", "Rate your experience with gaming, streaming, or video calls.")}
                      {renderRatingGroup("peakPerformance", "Peak Time Quality", "How is your speed during evening hours (7PM - 11PM)?")}
                    </>
                  )}

                  {activeCategory === 'Support' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Support Agent</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Agent Name</option>
                          {supportStaff.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("professionalism", "Agent Professionalism", "How helpful and polite was the support agent?")}
                      {renderRatingGroup("clarity", "Explanation Clarity", "Did the agent clearly explain the solution or problem?")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6">
                        <div className="max-w-md">
                          <h3 className="font-display text-lg text-primary font-bold">First Contact Resolution</h3>
                          <p className="text-on-surface-variant text-xs">Was your issue fixed on the very first call?</p>
                        </div>
                        <RadioGroup onValueChange={v => handleRating('fcr', v)} className="flex gap-8">
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="fcr-yes" /><Label htmlFor="fcr-yes" className="font-bold">Yes</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="fcr-no" /><Label htmlFor="fcr-no" className="font-bold">No</Label></div>
                        </RadioGroup>
                      </div>
                    </>
                  )}

                  {activeCategory === 'Testimonials' && (
                    <>
                      <div className="space-y-4">
                        <label className="font-display text-xl font-bold">How did you hear about us?</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" value={formData.referralSource} onChange={e => setFormData({...formData, referralSource: e.target.value})}>
                          <option>Social Media</option>
                          <option>Word of Mouth / Friend</option>
                          <option>Roadside Banner</option>
                          <option>Search Engine</option>
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="font-display text-xl font-bold">Your Success Story</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold" placeholder="Tell us how I-World has helped your home or business..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                      {renderRatingGroup("signal", "Signal Strength", "How would you rate the Wi-Fi signal coverage in your premises?")}
                    </>
                  )}

                  {activeCategory === 'Installation' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Field Technician</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Technician</option>
                          {technicians.map(t => <option key={t.name} value={t.name}>{t.name} ({t.region})</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("punctuality", "Punctuality", "Did the team arrive within the scheduled window?")}
                      {renderRatingGroup("quality", "Neatness of Setup", "How would you rate the neatness of the fiber cabling?")}
                      {renderRatingGroup("explanation", "Equipment Orientation", "Did the technician explain how the router/ONT works?")}
                    </>
                  )}

                  {activeCategory === 'Billing' && (
                    <>
                      {renderRatingGroup("accuracy", "Invoice Accuracy", "Was your last bill clearly explained and accurate?")}
                      {renderRatingGroup("reconnection", "Reconnection Speed", "How fast was service restored after your last payment?")}
                    </>
                  )}

                  <div className="pt-8">
                    <Button type="submit" disabled={isSubmitted || isSubmitting} className={cn("w-full md:w-auto px-12 py-7 rounded-full font-bold transition-all flex items-center justify-center gap-3 text-white uppercase text-[12px] tracking-widest", isSubmitted ? "bg-green-600" : "bg-primary hover:scale-[1.02]")}>
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isSubmitted ? (
                        <>Feedback Received <CircleCheck className="w-5 h-5" /></>
                      ) : (
                        <>Submit Report <ArrowRight className="w-5 h-5" /></>
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-border py-12">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="space-y-4">
            <div className="font-mono text-[12px] font-bold text-primary uppercase">I-World Networks</div>
            <p className="text-on-surface-variant text-sm max-w-xs font-bold uppercase opacity-70">Reliable Fiber ISP solutions across Southwest Nigeria.</p>
            <div className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">© 2026 I-World Networks</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-4">
            {validRegions.map(r => <a key={r} href="#" className="text-on-surface-variant hover:text-secondary font-mono text-[10px] uppercase font-bold">{r}</a>)}
          </div>
        </div>
      </footer>
    </div>
  );
}
