
'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PlaceHolderImages, type ImagePlaceholder } from '@/lib/placeholder-images';
import { 
  LayoutDashboard, 
  Headset, 
  Star, 
  Wrench, 
  CreditCard, 
  ArrowRight,
  CircleCheck,
  Loader2,
  CalendarDays,
  Clock,
  Hammer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { billingStaff, fieldTechnicians, supportStaff } from '@/lib/staff';

type Category = 'Reliability' | 'Support' | 'Testimonials' | 'Installation' | 'Billing' | 'FieldSupport';

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
    referralSource: 'Social Media',
    spotlightInterview: 'Maybe',
    serviceDate: '',
    serviceDateEnd: '',
    serviceTime: '',
    submissionDate: ''
  });

  const { toast } = useToast();
  const validRegions = ['Abeokuta', 'Ibadan', 'Osogbo', 'Akure'];

  const residentialPlans = ['H-Lite', 'H-Pro', 'H-Max', 'H-Custom'];
  const businessPlans = ['U-Lite', 'U-Pro', 'U-Max', 'U-Custom'];

  const categories = [
    { name: 'Reliability' as Category, icon: LayoutDashboard, label: 'Internet Quality' },
    { name: 'Support' as Category, icon: Headset, label: 'Customer Support' },
    { name: 'FieldSupport' as Category, icon: Hammer, label: 'Field Support' },
    { name: 'Testimonials' as Category, icon: Star, label: 'Share Your Story' },
    { name: 'Installation' as Category, icon: Wrench, label: 'Customer Onboarding' },
    { name: 'Billing' as Category, icon: CreditCard, label: 'Payments & Billing' },
  ];

  const images = {
    fiber: PlaceHolderImages.find(img => img.id === 'hero-fiber')!,
    customer: PlaceHolderImages.find(img => img.id === 'hero-customer')!,
    server: PlaceHolderImages.find(img => img.id === 'server-room')!,
    tech: PlaceHolderImages.find(img => img.id === 'tech-samuel')!,
    workspace: PlaceHolderImages.find(img => img.id === 'workspace')!,
  };

  const heroContent: Record<Category, { title: React.ReactNode, sub: string, img: ImagePlaceholder }> = {
    Reliability: {
      title: (<>Stay <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill sizes="100px" className="object-cover" /></div> Connected <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="100px" className="object-cover" /></div> Always.</>),
      sub: "Help us monitor your internet quality. We want to ensure you have consistent high-speed fiber every single day.",
      img: images.server
    },
    Support: {
      title: (<>Fast <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="100px" className="object-cover" /></div> Answers <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill sizes="100px" className="object-cover" /></div> Locally.</>),
      sub: "How was your experience with our support team? We're here to help and value your honest feedback.",
      img: images.tech
    },
    FieldSupport: {
      title: (<>Field <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill sizes="100px" className="object-cover" /></div> Support <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill sizes="100px" className="object-cover" /></div> Restored.</>),
      sub: "How was your equipment repair or service restoration experience? Rate our field support performance.",
      img: images.tech
    },
    Testimonials: {
      title: (<>Real <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="100px" className="object-cover" /></div> Stories <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill sizes="100px" className="object-cover" /></div> Shared.</>),
      sub: "Has I-World helped your home or business? Share your success story with us and the community.",
      img: images.workspace
    },
    Installation: {
      title: (<>Professional <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.tech.imageUrl} alt="tech" fill sizes="100px" className="object-cover" /></div> connectivity <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.fiber.imageUrl} alt="fiber" fill sizes="100px" className="object-cover" /></div> Installation.</>),
      sub: "Tell us about your installation. We aim for a neat, quick, and professional experience every time.",
      img: images.tech
    },
    Billing: {
      title: (<>Simple <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.workspace.imageUrl} alt="workspace" fill sizes="100px" className="object-cover" /></div> Payments <div className="relative h-[24px] w-[50px] md:h-[48px] md:w-[100px] rounded-full overflow-hidden inline-block mx-1 md:mx-2 border-2 border-white"><Image src={images.customer.imageUrl} alt="customer" fill sizes="100px" className="object-cover" /></div> Matter.</>),
      sub: "How is our payment process? We want to make sure the billing cycle is easy and clear for everyone.",
      img: images.server
    }
  };

  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      serviceDate: new Date().toISOString().split('T')[0],
      serviceDateEnd: new Date().toISOString().split('T')[0],
      serviceTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      submissionDate: new Date().toISOString().split('T')[0]
    }));
  }, []);

  const handleRating = (key: string, val: string | number) => {
    setRatings(prev => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const feedbackData = {
        ...formData,
        category: activeCategory,
        ratings,
      };

      const res = await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackData),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.error || `Server error ${res.status}`);
      }

      setIsSubmitted(true);
      toast({
        title: "Submission Successful",
        description: "Your feedback has been recorded. Thank you!",
      });

      setTimeout(() => {
        setIsSubmitted(false);
        setRatings({});
        setFormData({
          customerName: '',
          customerEmail: '',
          servicePlan: 'H-Pro',
          location: 'Abeokuta',
          comment: '',
          staffName: '',
          referralSource: 'Social Media',
          spotlightInterview: 'Maybe',
          serviceDate: new Date().toISOString().split('T')[0],
          serviceDateEnd: new Date().toISOString().split('T')[0],
          serviceTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          submissionDate: new Date().toISOString().split('T')[0]
        });
      }, 3000);

    } catch (err: unknown) {
      console.error('Submission failed:', err);
      toast({
        variant: "destructive",
        title: "Submission Error",
        description: err instanceof Error ? err.message : "Please check your network and try again.",
      });
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
              ratings[id] === num ? "bg-secondary text-white border-secondary shadow-md" : "hover:bg-surface-container text-on-surface"
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
            <Button size="lg" className="bg-secondary text-white px-10 py-7 rounded-full font-bold hover:scale-105 transition-transform uppercase text-[12px] tracking-widest shadow-xl" onClick={() => document.getElementById('feedback-portal')?.scrollIntoView({ behavior: 'smooth' })}>
              Start Feedback
            </Button>
          </div>
        </section>

        <section id="feedback-portal" className="px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
          <div className="bg-white rounded-3xl p-6 md:p-12 whisper-shadow border border-border grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-3">
              <p className="font-mono text-[10px] uppercase text-on-surface-variant mb-6 tracking-widest font-bold">Category</p>
              <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto pb-4 lg:pb-0 scrollbar-hide">
                {categories.map((cat) => (
                  <button key={cat.name} onClick={() => { setActiveCategory(cat.name); setRatings({}); setFormData(prev => ({ ...prev, staffName: '' })); }} className={cn("flex items-center gap-4 px-6 py-4 rounded-xl transition-all text-left whitespace-nowrap", activeCategory === cat.name ? "bg-secondary text-white shadow-lg" : "text-on-surface-variant hover:bg-surface-container font-bold")}>
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
                    <input required className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" placeholder="Samuel Oke" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Email</label>
                    <input required type="email" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" placeholder="samuel@example.com" value={formData.customerEmail} onChange={e => setFormData({...formData, customerEmail: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {activeCategory === 'Reliability' ? (
                    <>
                      <div className="space-y-1">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold flex items-center gap-2">
                          <CalendarDays className="w-3 h-3 text-secondary" /> Start Date
                        </label>
                        <input required type="date" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" value={formData.serviceDate} onChange={e => setFormData({...formData, serviceDate: e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold flex items-center gap-2">
                          <CalendarDays className="w-3 h-3 text-secondary" /> End Date
                        </label>
                        <input required type="date" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" value={formData.serviceDateEnd} onChange={e => setFormData({...formData, serviceDateEnd: e.target.value})} />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold flex items-center gap-2">
                        <CalendarDays className="w-3 h-3 text-secondary" /> Date of Experience
                      </label>
                      <input required type="date" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" value={formData.serviceDate} onChange={e => setFormData({...formData, serviceDate: e.target.value})} />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold flex items-center gap-2">
                      <CalendarDays className="w-3 h-3 text-secondary" /> Submission Date
                    </label>
                    <input required type="date" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" value={formData.submissionDate} onChange={e => setFormData({...formData, submissionDate: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold flex items-center gap-2">
                      <Clock className="w-3 h-3 text-secondary" /> Approx Time of Experience
                    </label>
                    <input required type="time" className="w-full bg-transparent border-b border-border py-2 outline-none focus:border-secondary transition-colors font-bold" value={formData.serviceTime} onChange={e => setFormData({...formData, serviceTime: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Region</label>
                    <select className="w-full bg-transparent border-b border-border py-2 outline-none cursor-pointer font-bold" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})}>
                      {validRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Connectivity Plan</label>
                    <select className="w-full bg-transparent border-b border-border py-2 outline-none cursor-pointer font-bold" value={formData.servicePlan} onChange={e => setFormData({...formData, servicePlan: e.target.value})}>
                      <optgroup label="Residential (H-Series)">
                        {residentialPlans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </optgroup>
                      <optgroup label="Business (U-Series)">
                        {businessPlans.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </optgroup>
                      <optgroup label="Enterprise">
                        <option value="Enterprise">Enterprise</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className="space-y-8">
                  {activeCategory === 'Reliability' && (
                    <>
                      {renderRatingGroup("stability", "Stability", "How consistent is your connectivity?")}
                      {renderRatingGroup("latency", "Latency", "Gaming and real-time streaming quality.")}
                      {renderRatingGroup("peakPerformance", "Peak Performance", "Quality during evening hours (7PM-11PM).")}
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Describe Issues or Additional Feedback</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Please describe any latency, stability, or performance issues in detail..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                    </>
                  )}

                  {activeCategory === 'Support' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Support Agent</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" value={formData.staffName} onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Representative</option>
                          {supportStaff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("professionalism", "Agent Conduct", "How helpful and professional was the support agent?")}
                      {renderRatingGroup("clarity", "Solution Clarity", "How clearly was your issue explained to you?")}
                      {renderRatingGroup("responsiveness", "Response Speed", "How quickly did an agent respond to your request?")}
                      {renderRatingGroup("knowledge", "Agent Knowledge", "How knowledgeable was the agent about your issue?")}
                      {renderRatingGroup("friendliness", "Agent Friendliness", "How polite and friendly was the agent?")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6">
                        <div className="max-w-md">
                          <h3 className="font-display text-lg text-primary font-bold">First Contact Resolution</h3>
                          <p className="text-on-surface-variant text-xs">Was your issue fully resolved during this interaction?</p>
                        </div>
                        <RadioGroup onValueChange={v => handleRating('fcr', v)} className="flex gap-8">
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="fcr-yes" /><Label htmlFor="fcr-yes" className="font-bold">Yes</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="fcr-no" /><Label htmlFor="fcr-no" className="font-bold">No</Label></div>
                        </RadioGroup>
                      </div>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Describe Issues or Additional Feedback</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Tell us more about your support experience or describe your issue..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                    </>
                  )}

                  {activeCategory === 'FieldSupport' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Field Technician</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" value={formData.staffName} onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Technician</option>
                          {fieldTechnicians.map(t => <option key={t.id} value={t.name}>{t.name} ({t.region})</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("resolutionSpeed", "Resolution Speed", "How quickly was the physical repair or service restoration completed?")}
                      {renderRatingGroup("repairQuality", "Repair Quality", "Quality of cabling, equipment replacement, or physical restoration.")}
                      {renderRatingGroup("conduct", "Technician Conduct", "Was the technician polite, professional, and helpful?")}
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Describe Issues or Additional Feedback</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Describe the physical repair details or equipment issue and any feedback about the service visit..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                    </>
                  )}

                  {activeCategory === 'Testimonials' && (
                    <>
                      <div className="space-y-6">
                        <div className="space-y-1">
                          <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">How did you find us?</label>
                          <select className="w-full bg-transparent border-b border-border py-2 outline-none cursor-pointer font-bold" value={formData.referralSource} onChange={e => setFormData({...formData, referralSource: e.target.value})}>
                            <option>Social Media</option>
                            <option>Friend/Colleague</option>
                            <option>Corporate Partnership</option>
                            <option>Outdoor Banner</option>
                          </select>
                        </div>
                        <div className="space-y-4">
                          <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Your Story</label>
                          <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Share your experience with I-World..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                        </div>
                        
                        <div className="p-8 bg-surface-container-low rounded-2xl border border-border/50 flex flex-col md:flex-row items-center justify-between gap-6">
                          <div>
                            <h3 className="font-display text-lg font-bold text-primary">Spotlight Interview</h3>
                            <p className="text-on-surface-variant text-xs mt-1">Would you join us for a featured customer story?</p>
                          </div>
                          <div className="flex bg-white p-1 rounded-full border border-border">
                            {['Yes', 'No', 'Maybe'].map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setFormData({...formData, spotlightInterview: opt})}
                                className={cn(
                                  "px-6 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest transition-all font-bold",
                                  formData.spotlightInterview === opt ? "bg-secondary text-white shadow-sm" : "text-on-surface-variant hover:bg-muted"
                                )}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {renderRatingGroup("signal", "Signal Coverage", "How would you rate your overall connection strength?")}
                    </>
                  )}

                  {activeCategory === 'Installation' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Field Technician</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" value={formData.staffName} onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Installer</option>
                          {fieldTechnicians.map(t => <option key={t.id} value={t.name}>{t.name} ({t.region})</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("punctuality", "Punctuality", "Did the technician arrive on time for the appointment?")}
                      {renderRatingGroup("quality", "Installation Quality", "How neat and professional was the installation work?")}
                      {renderRatingGroup("explanation", "Installation Guide", "Did the technician show you how your equipment works?")}
                      {renderRatingGroup("timeliness", "Installation Speed", "Time taken to complete the installation once started.")}
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Describe Issues or Additional Feedback</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Tell us about the installation quality or orientation process..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                    </>
                  )}

                  {activeCategory === 'Billing' && (
                    <>
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Billing Agent</label>
                        <select className="w-full bg-surface-container-low p-4 rounded-xl border border-border outline-none font-bold" value={formData.staffName} onChange={e => setFormData({...formData, staffName: e.target.value})} required>
                          <option value="">Select Billing Agent</option>
                          {billingStaff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                      </div>
                      {renderRatingGroup("accuracy", "Billing Accuracy", "Transparency and clarity of invoices.")}
                      {renderRatingGroup("reconnection", "Internet Restoration", "Speed of internet restoration after billing or payment issues.")}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-6 border-b border-border/50">
                        <div className="max-w-md">
                          <h3 className="font-display text-lg text-primary font-bold">Portal Payment</h3>
                          <p className="text-on-surface-variant text-xs">Did you use the customer portal to make your payment?</p>
                        </div>
                        <RadioGroup onValueChange={v => handleRating('usedPortal', v)} className="flex gap-8">
                          <div className="flex items-center space-x-2"><RadioGroupItem value="Yes" id="portal-yes" /><Label htmlFor="portal-yes" className="font-bold">Yes</Label></div>
                          <div className="flex items-center space-x-2"><RadioGroupItem value="No" id="portal-no" /><Label htmlFor="portal-no" className="font-bold">No</Label></div>
                        </RadioGroup>
                      </div>
                      {renderRatingGroup("portalEase", "Portal Ease of Use", "Rate your experience using the customer portal to pay.")}
                      <div className="space-y-4 py-4">
                        <label className="font-mono text-[10px] uppercase text-on-surface-variant font-bold">Describe Issues or Additional Feedback</label>
                        <textarea className="w-full bg-surface-container-low p-6 rounded-2xl border border-border min-h-[150px] outline-none resize-none font-bold placeholder:opacity-30" placeholder="Describe any billing issues or suggestions in detail..." value={formData.comment} onChange={e => setFormData({...formData, comment: e.target.value})} />
                      </div>
                    </>
                  )}

                  <div className="pt-8">
                    <Button type="submit" disabled={isSubmitted || isSubmitting} className={cn("w-full md:w-auto px-12 py-7 rounded-full font-bold transition-all flex items-center justify-center gap-3 text-white uppercase text-[12px] tracking-widest shadow-xl", isSubmitted ? "bg-green-600" : "bg-primary hover:scale-[1.02]")}>
                      {isSubmitting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isSubmitted ? (
                        <>Success <CircleCheck className="w-5 h-5" /></>
                      ) : (
                        <>Submit Feedback <ArrowRight className="w-5 h-5" /></>
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
            <p className="text-on-surface-variant text-sm max-w-xs font-bold uppercase opacity-70">Southwest Nigeria&apos;s connectivity Backbone.</p>
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
