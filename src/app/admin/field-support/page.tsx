'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, Zap, Hammer, CheckCircle2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks, updateFeedbackStatus } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export default function AdminFieldSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackDoc | null>(null);
  const [resNotes, setResNotes] = useState('');
  
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();

  const { feedbacks, mutate } = useAdminFeedbacks();

  const fieldItems = useMemo(() => {
    return feedbacks.filter((f: FeedbackDoc) => f.category === 'FieldSupport');
  }, [feedbacks]);

  const stats = useMemo(() => {
    if (fieldItems.length === 0) {
      return { 
        resolutionSpeed: '0.0', 
        repairQuality: '0.0', 
        conduct: '0.0', 
        successRate: 0, 
        sentiment: { pos: 0, neu: 0, frust: 0 }, 
        avgTime: '—' 
      };
    }

    const totalSpeed = fieldItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.resolutionSpeed || 0), 0);
    const totalQuality = fieldItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.repairQuality || 0), 0);
    const totalConduct = fieldItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.conduct || 0), 0);

    const goodRepairs = fieldItems.filter((f: FeedbackDoc) => Number(f.ratings?.repairQuality || 0) >= 4).length;

    // Derived sentiment from conduct rating
    const pos = fieldItems.filter((f: FeedbackDoc) => Number(f.ratings?.conduct || 0) >= 4).length;
    const frust = fieldItems.filter((f: FeedbackDoc) => Number(f.ratings?.conduct || 0) <= 2).length;
    const neu = fieldItems.length - pos - frust;

    // Map resolutionSpeed rating (1-5) to approximate physical response / resolution time
    // 5 = fast (2h), 1 = slow (24h)
    const avgSpeed = totalSpeed / fieldItems.length;
    const avgHours = Math.round(24 - ((avgSpeed - 1) / 4) * 22);

    return {
      resolutionSpeed: (totalSpeed / fieldItems.length).toFixed(1),
      repairQuality: (totalQuality / fieldItems.length).toFixed(1),
      conduct: (totalConduct / fieldItems.length).toFixed(1),
      successRate: Math.round((goodRepairs / fieldItems.length) * 100),
      sentiment: {
        pos: Math.round((pos / fieldItems.length) * 100),
        neu: Math.round((neu / fieldItems.length) * 100),
        frust: Math.round((frust / fieldItems.length) * 100)
      },
      avgTime: `${avgHours}h`
    };
  }, [fieldItems]);

  const volumeData = useMemo(() => {
    const groups: Record<string, { name: string, tickets: number, timestamp: number }> = {};
    
    fieldItems.forEach((f: FeedbackDoc) => {
      const date = new Date(f.timestamp ?? 0);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!groups[label]) {
        groups[label] = {
          name: label,
          tickets: 0,
          timestamp: f.timestamp ?? 0
        };
      }
      groups[label].tickets += 1;
    });

    return Object.values(groups)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ name, tickets }) => ({
        date: name,
        tickets
      }));
  }, [fieldItems]);

  const techLeaderboard = useMemo(() => {
    const techsRoster = [
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

    return techsRoster.map((t: { name: string; region: string }) => {
      const completions = fieldItems.filter((f: FeedbackDoc) => f.staffName === t.name).length;
      return {
        ...t,
        completions
      };
    }).sort((a, b) => b.completions - a.completions).slice(0, 5);
  }, [fieldItems]);

  const handleUpdateStatus = async (feedbackId: string, status: string) => {
    if (!user) return;
    try {
      await updateFeedbackStatus(feedbackId, status, resNotes, user);
      toast({ title: "Status Updated", description: `Feedback marked as ${status}.` });
      mutate();
      setSelectedFeedback(null);
      setResNotes('');
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Update Failed", description: e instanceof Error ? e.message : 'Error' });
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight mb-2 uppercase font-black">Field Support Overview</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">Track repair quality, speed, and success rates.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-12">
        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Clock className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Avg Repair Time</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.avgTime}</h3>
          <div className="flex items-center gap-2 mt-4 text-green-600 font-bold text-xs"><Zap className="w-4 h-4" /> Target: &lt; 24h</div>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Repair Quality</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.repairQuality}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Repair quality</p>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Brain className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Success Rate</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.successRate}%</h3>
          <div className="w-full bg-muted h-1 rounded-full mt-6">
            <div className="bg-secondary h-1 rounded-full transition-all duration-1000" style={{ width: `${stats.successRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white p-8 border border-border whisper-shadow rounded-xl">
          <Zap className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Staff Courtesy</p>
          <h3 className="font-mono text-4xl font-black mt-2">{stats.conduct}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Professionalism</p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-12">
        <div className="col-span-12 lg:col-span-8 bg-white p-8 border border-border whisper-shadow rounded-xl h-[450px] flex flex-col">
          <h4 className="font-display text-xl text-primary font-bold mb-10">Repair Volume</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="colorTicketsField" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#448515" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#448515" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="tickets" stroke="#448515" fill="url(#colorTicketsField)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 bg-white p-8 border border-border whisper-shadow rounded-xl">
          <h4 className="font-display text-xl mb-8 text-primary font-bold">Customer Sentiment</h4>
          <div className="space-y-6">
            {[
              { label: 'Positive', val: stats.sentiment.pos, color: 'bg-secondary' },
              { label: 'Neutral', val: stats.sentiment.neu, color: 'bg-slate-400' },
              { label: 'Frustrated', val: stats.sentiment.frust, color: 'bg-destructive' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider">{item.label}</span>
                  <span className="font-bold text-xs">{item.val}%</span>
                </div>
                <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                  <div className={cn("h-full transition-all duration-1000", item.color)} style={{ width: barsAnimated ? `${item.val}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <section className="col-span-12 lg:col-span-5 bg-white border border-border whisper-shadow rounded-xl p-8">
          <h4 className="font-display text-xl text-primary font-bold mb-8">Field Team Leaderboard</h4>
          <div className="space-y-6">
            {techLeaderboard.map((tech: { name: string; region: string; completions: number }) => (
              <div key={tech.name} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-border bg-muted flex items-center justify-center font-mono font-bold text-secondary">
                  {tech.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-primary text-sm">{tech.name}</p>
                  <p className="font-mono text-[10px] text-on-surface-variant uppercase">{tech.region}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-secondary text-lg"><span className="font-mono">{tech.completions}</span></p>
                  <p className="font-mono text-[8px] uppercase opacity-60">Jobs</p>
                </div>
              </div>
            ))}
            {techLeaderboard.length === 0 && (
              <p className="text-[10px] font-mono opacity-40 text-center py-4">Waiting for data...</p>
            )}
          </div>
        </section>

        <section className="col-span-12 lg:col-span-7 bg-white border border-border whisper-shadow rounded-xl p-8">
          <h4 className="font-display text-xl text-primary font-bold mb-8">Recent Feedback & Actions</h4>
          <div className="space-y-4">
            {fieldItems.slice(0, 10).map((f: FeedbackDoc) => (
              <div key={f.id} className="p-4 border border-border rounded-xl bg-surface-container-lowest flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-mono font-bold uppercase",
                      f.status === 'resolved' ? "bg-green-100 text-green-600" : 
                      f.status === 'open' ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50" : "bg-blue-100 text-blue-600"
                    )}>
                      {f.status}
                    </span>
                    <span className="font-mono text-[9px] text-on-surface-variant uppercase font-bold">Tech: {f.staffName || 'Unknown'}</span>
                    {f.servicePlan && (
                      <span className="font-mono text-[9px] text-on-surface-variant/60 font-bold">Plan: {f.servicePlan}</span>
                    )}
                  </div>
                  <span className="text-[9px] text-on-surface-variant/40 font-mono">
                    Exp: {f.serviceDate} {f.submissionDate && `| Sub: ${f.submissionDate}`}
                  </span>
                </div>
                <div>
                  <p className="font-mono text-xs font-bold text-primary">{f.customerName} <span className="opacity-40 font-normal">({f.location})</span></p>
                  {f.comment && <p className="text-xs text-on-surface-variant italic mt-1 font-body">"{f.comment}"</p>}
                </div>

                <div className="flex items-center justify-between border-t border-border/50 pt-3 mt-1">
                  <div className="flex gap-4 text-[9px] font-mono text-on-surface-variant">
                    <span>Speed: {String(f.ratings?.resolutionSpeed ?? '—')}/5</span>
                    <span>Quality: {String(f.ratings?.repairQuality ?? '—')}/5</span>
                    <span>Conduct: {String(f.ratings?.conduct ?? '—')}/5</span>
                  </div>

                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 rounded-full px-4 font-mono text-[8px] uppercase font-bold" onClick={() => { setSelectedFeedback(f); setResNotes(f.resolutionNotes || ''); }}>
                        <MessageSquare className="w-2.5 h-2.5 mr-1" /> Take Action
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md rounded-3xl">
                      <DialogHeader>
                        <DialogTitle className="font-display uppercase tracking-tight">Resolve Feedback</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-6 py-4">
                        {f.comment && <div className="p-4 bg-muted rounded-xl text-sm italic">"{f.comment}"</div>}
                        <div className="space-y-2">
                          <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Resolution Notes</label>
                          <Textarea placeholder="What was done to resolve this?" className="min-h-[120px] rounded-2xl" value={resNotes} onChange={(e) => setResNotes(e.target.value)} />
                        </div>
                      </div>
                      <DialogFooter className="flex gap-2">
                        <Button variant="outline" className="rounded-full font-mono text-[10px] uppercase font-bold" onClick={() => handleUpdateStatus(f.id, 'escalated')}>Escalate</Button>
                        <Button className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8" onClick={() => handleUpdateStatus(f.id, 'resolved')}>
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
            {fieldItems.length === 0 && (
              <div className="py-12 text-center border-2 border-dashed border-border rounded-xl">
                <p className="font-mono text-xs text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">No Field Support Records</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
