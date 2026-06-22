'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { 
  AreaChart, 
  Area, 
  BarChart, 
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function AdminSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const auth = useAuth();
  const { user } = useUser(auth);

  const { feedbacks } = useAdminFeedbacks();

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) {
      return { 
        professionalism: '0.0', 
        clarity: '0.0', 
        responsiveness: '0.0',
        knowledge: '0.0',
        friendliness: '0.0',
        fcrRate: 0, 
        sentiment: { pos: 0, neu: 0, frust: 0 }, 
        avgResponse: '—' 
      };
    }
    
    const supportItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Support');
    if (supportItems.length === 0) {
      return { 
        professionalism: '0.0', 
        clarity: '0.0', 
        responsiveness: '0.0',
        knowledge: '0.0',
        friendliness: '0.0',
        fcrRate: 0, 
        sentiment: { pos: 0, neu: 0, frust: 0 }, 
        avgResponse: '—' 
      };
    }

    const totalProf = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.professionalism || 0), 0);
    const totalClarity = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.clarity || 0), 0);
    const totalResp = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.responsiveness || 0), 0);
    const totalKnowledge = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.knowledge || 0), 0);
    const totalFriendliness = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.friendliness || 0), 0);
    const fcrCount = supportItems.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes').length;

    // Derived sentiment from professionalism rating
    const pos = supportItems.filter((f: FeedbackDoc) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = supportItems.filter((f: FeedbackDoc) => Number(f.ratings?.professionalism || 0) <= 2).length;
    const neu = supportItems.length - pos - frust;

    // Derive avg response from responsiveness rating (1-5 mapped to minutes)
    const totalRespForTime = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.responsiveness || f.ratings?.professionalism || 0), 0);
    const avgRespForTime = totalRespForTime / supportItems.length;
    // Map 5=fast(8m), 1=slow(45m)
    const avgMinutes = Math.round(45 - ((avgRespForTime - 1) / 4) * 37);

    return {
      professionalism: (totalProf / supportItems.length).toFixed(1),
      clarity: (totalClarity / supportItems.length).toFixed(1),
      responsiveness: (totalResp / supportItems.length).toFixed(1),
      knowledge: (totalKnowledge / supportItems.length).toFixed(1),
      friendliness: (totalFriendliness / supportItems.length).toFixed(1),
      fcrRate: Math.round((fcrCount / supportItems.length) * 100),
      sentiment: {
        pos: Math.round((pos / supportItems.length) * 100),
        neu: Math.round((neu / supportItems.length) * 100),
        frust: Math.round((frust / supportItems.length) * 100)
      },
      avgResponse: `${avgMinutes}m`
    };
  }, [feedbacks]);

  // Derived trend data from recent feedbacks
  const volumeData = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return [];
    const supportItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Support');
    
    const groups: Record<string, { name: string, tickets: number, timestamp: number }> = {};
    
    supportItems.forEach((f: FeedbackDoc) => {
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
  }, [feedbacks]);

  const dimensionData = useMemo(() => {
    return [
      { name: 'Helpfulness', score: Number(stats.professionalism) },
      { name: 'Clarity', score: Number(stats.clarity) },
      { name: 'Response Speed', score: Number(stats.responsiveness) },
      { name: 'Agent Knowledge', score: Number(stats.knowledge) },
      { name: 'Friendliness', score: Number(stats.friendliness) },
    ];
  }, [stats]);

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AdminLayout>
      <div className="mb-12">
        <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight mb-2">Support Overview</h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">Performance and satisfaction ratings for our support team.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-gutter mb-12">
        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <Clock className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Avg Response</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.avgResponse}</h3>
          <div className="flex items-center gap-1 mt-4 text-green-600 font-bold text-[9px]"><Zap className="w-3.5 h-3.5" /> Estimated time</div>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Helpfulness</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.professionalism}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Staff helpfulness</p>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <Zap className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Clarity Score</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.clarity}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Explanation quality</p>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <Clock className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Response Speed</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.responsiveness}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Response speed</p>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <Brain className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Staff Knowledge</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.knowledge}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Knowledge rating</p>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Friendliness</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.friendliness}/5</h3>
          <p className="text-on-surface-variant mt-2 text-[10px]">Friendliness rating</p>
        </div>

        <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
          <Brain className="w-8 h-8 text-secondary mb-4" />
          <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">First-Time Fix Rate</p>
          <h3 className="font-mono text-3xl font-black mt-2">{stats.fcrRate}%</h3>
          <div className="w-full bg-muted h-1 rounded-full mt-6">
            <div className="bg-secondary h-1 rounded-full transition-all duration-1000" style={{ width: `${stats.fcrRate}%` }}></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <div className="col-span-12 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col mb-6">
          <h4 className="font-display text-xl text-primary font-bold mb-10">Requests Over Time</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeData}>
                <defs>
                  <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#448515" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#448515" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="tickets" stroke="#448515" fill="url(#colorTickets)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col">
          <h4 className="font-display text-xl text-primary font-bold mb-6">Response Quality</h4>
          <div className="flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dimensionData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                <XAxis type="number" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} width={110} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="score" fill="#448515" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col">
          <h4 className="font-display text-xl mb-8 text-primary font-bold">Customer Sentiment</h4>
          <div className="space-y-6 flex-1 flex flex-col justify-center">
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
    </AdminLayout>
  );
}