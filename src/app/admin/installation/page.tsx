'use client';

import React, { useMemo, useState } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Map, List, CircleCheck, Clock, Shield } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks, updateFeedbackStatus } from '@/hooks/use-admin-feedbacks';
import { fieldTechnicians } from '@/lib/staff';
import type { FeedbackDoc } from '@/lib/feedback-types';
import FeedbackQuote from '@/components/FeedbackQuote';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, MessageSquare } from 'lucide-react';

export default function AdminInstallation() {
  const networkMap = PlaceHolderImages.find(img => img.id === 'network-map')!;
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDoc | null>(null);
  const [resNotes, setResNotes] = useState('');

  const techsRoster = fieldTechnicians.map(t => ({ name: t.name, region: t.region || '—' }));

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!user) return;
    try {
      await updateFeedbackStatus(feedbackId, status, resNotes, user);
      toast({ title: 'Status Updated', description: `Feedback marked as ${status}.` });
      mutate();
      setSelectedFeedback(null);
      setResNotes('');
    } catch (e: unknown) {
      toast({ variant: 'destructive', title: 'Update Failed', description: e instanceof Error ? e.message : 'Error' });
    }
  };

  const { feedbacks: allFeedbacks, loading, mutate } = useAdminFeedbacks();

  const installFeedback = useMemo(() => {
    return allFeedbacks.filter((f: FeedbackDoc) => f.category === 'Installation');
  }, [allFeedbacks]);

  const techLeaderboard = useMemo(() => {
    if (!installFeedback) return techsRoster.map(t => ({ ...t, completions: 0 })).slice(0, 5);
    
    return techsRoster.map((t: { name: string; region: string }) => {
      const completions = installFeedback.filter((f: FeedbackDoc) => f.staffName === t.name).length;
      return {
        ...t,
        completions
      };
    }).sort((a, b) => b.completions - a.completions).slice(0, 5);
  }, [installFeedback]);

  const completionRate = useMemo(() => {
    if (!installFeedback || installFeedback.length === 0) return '0';
    const goodInstalls = installFeedback.filter((f: FeedbackDoc) => Number(f.ratings?.quality || 0) >= 4).length;
    return ((goodInstalls / installFeedback.length) * 100).toFixed(1);
  }, [installFeedback]);

  const avgSetupTime = useMemo(() => {
    if (!installFeedback || installFeedback.length === 0) return { score: '0.0', minutes: '—' };
    const totalTimeliness = installFeedback.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.timeliness || 0), 0);
    const avg = totalTimeliness / installFeedback.length;
    // Map 1-5 rating to approximate minutes (5=fast ~30m, 1=slow ~90m)
    const minutes = Math.round(90 - ((avg - 1) / 4) * 60);
    return {
      score: `${avg.toFixed(1)}/5`,
      minutes: `${minutes}m`
    };
  }, [installFeedback]);

  const completedJobs = useMemo(() => {
    if (!installFeedback) return '0';
    return installFeedback.filter((f: FeedbackDoc) => f.status === 'resolved').length.toLocaleString();
  }, [installFeedback]);

  const regionalDrops = useMemo(() => {
    const drops: Record<string, number> = { Abeokuta: 0, Ibadan: 0, Osogbo: 0, Akure: 0 };
    if (!installFeedback) return drops;
    installFeedback.forEach((f: FeedbackDoc) => {
      const loc = f.location;
      if (loc && loc in drops) drops[loc]++;
    });
    return drops;
  }, [installFeedback]);

  return (
    <AdminLayout>
      <div className="grid grid-cols-12 gap-gutter mb-16">
        <div className="col-span-12 md:col-span-7">
          <h1 className="font-headline text-headline-lg mb-4 text-primary">Installation Performance</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Installation speed, team performance, and regional activity.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 flex flex-col justify-end">
          <div className="bg-white p-6 whisper-shadow rounded-xl border border-border">
            <span className="font-mono text-[12px] uppercase text-secondary">Quality Score</span>
            <div className="text-2xl text-3xl font-black mt-2"><span className="font-mono">+{completionRate}%</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter">
        <section className="col-span-12 md:col-span-5 bg-white whisper-shadow rounded-xl p-8 border border-border">
          <div className="flex justify-between items-center mb-10">
            <h3 className="font-headline text-[24px] font-bold">Field Leaderboard</h3>
            <CircleCheck className="w-6 h-6 text-secondary" />
          </div>
          <div className="space-y-8">
            {techLeaderboard.map((tech: { name: string; region: string; completions: number }) => (
              <div key={tech.name} className="flex items-center gap-6 group hover:scale-[1.01] transition-transform">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center font-mono font-bold text-secondary">
                  {tech.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-on-surface text-lg">{tech.name}</p>
                  <p className="font-mono text-sm text-on-surface-variant">{tech.region}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-secondary text-xl"><span className="font-mono">{tech.completions}</span></p>
                  <p className="font-mono text-[10px] uppercase opacity-60">Setups</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 md:col-span-7 bg-white whisper-shadow rounded-xl p-8 border border-border flex flex-col min-h-[500px]">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h3 className="font-headline text-[24px] font-bold">Service Interruptions</h3>
              <p className="font-mono text-sm text-on-surface-variant mt-1">Recent installation activity across regions.</p>
            </div>
            <div className="flex gap-2">
              <Button size="icon" className="w-10 h-10 bg-primary text-white"><Map className="w-5 h-5" /></Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden rounded-lg bg-surface-container-low group">
            <Image 
              src={networkMap.imageUrl} 
              alt="Network Map" 
              fill 
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 50vw"
              className="object-cover grayscale contrast-[1.1] opacity-40 mix-blend-multiply transition-transform duration-1000 group-hover:scale-105" 
              data-ai-hint="network map" 
            />
            
            <div className="absolute top-1/4 left-1/4 group cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono text-xs font-bold">
                Ibadan: {regionalDrops.Ibadan} Installations
              </div>
            </div>
            <div className="absolute top-1/2 right-1/3 group cursor-pointer">
              <div className="w-4 h-4 bg-secondary rounded-full animate-ping absolute"></div>
              <div className="w-4 h-4 bg-secondary rounded-full relative border-2 border-white"></div>
              <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 font-mono text-xs font-bold">
                Abeokuta: {regionalDrops.Abeokuta} Installations
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mt-16 mb-24">
        {[
          { label: 'Avg Install Rating', val: avgSetupTime.score, info: `Approx. ${avgSetupTime.minutes} min install time`, icon: Clock },
          { label: 'Quality Score', val: `${completionRate}%`, info: 'National Average', icon: Shield },
          { label: 'Completed Installations', val: completedJobs, info: 'Goal: 100% completion rate', icon: CircleCheck, primary: true },
        ].map((item, i) => (
          <div key={i} className={cn("p-8 rounded-xl border border-border whisper-shadow", item.primary ? "bg-secondary text-white border-secondary" : "bg-white")}>
            <item.icon className={cn("w-8 h-8 mb-4", item.primary ? "text-white" : "text-secondary")} />
            <h4 className="font-bold text-lg mb-2">{item.label}</h4>
            <p className="text-2xl font-black font-mono">{item.val}</p>
            <p className={cn("text-xs font-mono mt-2", item.primary ? "text-white/80" : "text-on-surface-variant")}>{item.info}</p>
          </div>
        ))}
      </div>

      <section className="bg-white border border-border whisper-shadow rounded-xl p-8 mb-24">
        <h4 className="font-display text-xl text-primary font-bold mb-8">Recent Feedback & Actions</h4>
        <div className="space-y-4">
          {installFeedback.slice(0, 10).map((f: FeedbackDoc) => (
            <div key={f.id} className="p-4 border border-border rounded-xl bg-surface-container-lowest flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase',
                      f.status === 'resolved'
                        ? 'bg-green-100 text-green-600'
                        : f.status === 'open'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'
                          : 'bg-blue-100 text-blue-600',
                    )}
                  >
                    {f.status}
                  </span>
                  <span className="font-mono text-[9px] text-on-surface-variant uppercase font-bold">
                    Tech: {f.staffName || 'Unknown'}
                  </span>
                  {f.servicePlan && (
                    <span className="font-mono text-[9px] text-on-surface-variant/60 font-bold">Plan: {f.servicePlan}</span>
                  )}
                </div>
                <span className="text-[9px] text-on-surface-variant/40 font-mono">
                  Exp: {f.serviceDate} {f.submissionDate && `| Sub: ${f.submissionDate}`}
                </span>
              </div>
              <div>
                <p className="font-mono text-xs font-bold text-primary">
                  {f.customerName} <span className="opacity-40 font-normal">({f.location})</span>
                </p>
                <FeedbackQuote feedback={f} className="text-xs text-on-surface-variant mt-1 font-body" />
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
                <div className="flex gap-4 text-[9px] font-mono text-on-surface-variant">
                  <span>Quality: {String(f.ratings?.quality ?? '—')}/5</span>
                  <span>Timeliness: {String(f.ratings?.timeliness ?? '—')}/5</span>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-full px-4 font-mono text-[8px] uppercase font-bold"
                      onClick={() => {
                        setSelectedFeedback(f);
                        setResNotes(f.resolutionNotes || '');
                      }}
                    >
                      <MessageSquare className="w-2.5 h-2.5 mr-1" /> Take Action
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md rounded-3xl">
                    <DialogHeader>
                      <DialogTitle className="font-display uppercase tracking-tight">Resolve Feedback</DialogTitle>
                      <DialogDescription className="sr-only">Mark this feedback as resolved and add resolution notes.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="p-4 bg-muted rounded-xl text-sm">
                        <FeedbackQuote feedback={f} />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Resolution Notes</label>
                        <Textarea
                          placeholder="What was done to resolve this?"
                          className="min-h-[120px] rounded-2xl"
                          value={resNotes}
                          onChange={(e) => setResNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full font-mono text-[10px] uppercase font-bold"
                        onClick={() => handleUpdateStatus(f.id, 'escalated')}
                      >
                        Escalate
                      </Button>
                      <Button
                        className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8"
                        onClick={() => handleUpdateStatus(f.id, 'resolved')}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-2" /> Mark Resolved
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {f.resolutionNotes && (
                <div className="p-3 bg-muted rounded-lg text-[10px] font-mono border-l-2 border-secondary shadow-sm">
                  <span className="font-bold text-secondary uppercase block mb-1">Action:</span>
                  {f.resolutionNotes}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-4 border-secondary/20 border-t-secondary rounded-full animate-spin mx-auto" />
            </div>
          )}
          {!loading && installFeedback.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
              <p className="font-mono text-xs text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                No Installation Records
              </p>
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}