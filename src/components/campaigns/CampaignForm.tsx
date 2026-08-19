'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createCampaign, fetchSegments, fetchAudienceCount, type CampaignSegmentOptions } from '@/hooks/use-campaigns';
import type { User } from 'firebase/auth';

export type Audience = { type: 'all' } | { type: 'lifecycle' | 'city' | 'status' | 'servicePlan' | 'bts'; values: string[] };

const AUDIENCE_TYPES = [
  { value: 'all', label: 'All customers' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'city', label: 'City' },
  { value: 'status', label: 'Status' },
  { value: 'servicePlan', label: 'Service plan' },
  { value: 'bts', label: 'BTS' },
];

export function CampaignForm({ user, onCreated }: { user: User; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('campaign');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [audienceType, setAudienceType] = useState('all');
  const [values, setValues] = useState<string[]>([]);
  const [options, setOptions] = useState<CampaignSegmentOptions | null>(null);
  const [optionSearch, setOptionSearch] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSegments(user)
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [user]);

  const audience: Audience =
    audienceType === 'all' ? { type: 'all' } : { type: audienceType as 'lifecycle' | 'city' | 'status' | 'servicePlan' | 'bts', values };

  const handleCount = async () => {
    setCounting(true);
    try {
      const n = await fetchAudienceCount(user, audience);
      setCount(n);
    } catch {
      toast({ variant: 'destructive', title: 'Count failed', description: 'Could not resolve the audience.' });
    } finally {
      setCounting(false);
    }
  };

  const toggleValue = (v: string) => {
    setValues((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const optionList = audienceType === 'all' ? [] : (options?.[audienceType as keyof CampaignSegmentOptions] || []);
  const filteredOptions = optionSearch.trim()
    ? optionList.filter((o) => o.value.toLowerCase().includes(optionSearch.trim().toLowerCase()))
    : optionList;
  const selectedCount = optionList.filter((o) => values.includes(o.value)).reduce((sum, o) => sum + o.count, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !text.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Name, subject and text are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const { id } = await createCampaign(user, { name, type, subject, html, text, audience });
      toast({ title: 'Draft created', description: 'Review it, then a super admin can send it.' });
      onCreated(id);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Create failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. August Downtime Notice"
            className="rounded-xl font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="rounded-xl font-mono text-xs">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {['campaign', 'downtime', 'notice', 'other'].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject line"
          className="rounded-xl font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Plain text body</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Plain text version (required)"
          className="rounded-xl font-mono text-xs"
        />
      </div>

      <div className="space-y-2">
        <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">HTML body (optional)</Label>
        <Textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          rows={6}
          placeholder="<p>HTML version</p>"
          className="rounded-xl font-mono text-xs"
        />
      </div>

      <div className="space-y-3 bg-surface-container-low/50 p-4 rounded-2xl border border-border">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">Audience</Label>
          <Select
            value={audienceType}
            onValueChange={(v) => {
              setAudienceType(v);
              setValues([]);
              setOptionSearch('');
              setCount(null);
            }}
          >
            <SelectTrigger className="w-[180px] rounded-xl font-mono text-[10px] uppercase font-bold">
              <SelectValue placeholder="Segment" />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCE_TYPES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={counting}
            onClick={handleCount}
            className="rounded-xl font-mono text-[10px] uppercase font-bold"
          >
            <Users className="w-3.5 h-3.5 mr-1.5" />
            {counting ? 'Counting…' : 'Count'}
          </Button>
          {count !== null && (
            <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-secondary">
              {count.toLocaleString()} recipients
            </span>
          )}
        </div>

        {audienceType !== 'all' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={optionSearch}
                onChange={(e) => setOptionSearch(e.target.value)}
                placeholder={`Filter ${optionList.length} options...`}
                className="w-56 rounded-xl font-mono text-[10px]"
              />
              <span className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/60 font-bold">
                {selectedCount.toLocaleString()} selected customers
              </span>
            </div>
            {filteredOptions.length === 0 && (
              <p className="font-mono text-[10px] text-on-surface-variant/60">
                {optionList.length === 0 ? 'No options loaded.' : 'No options match the filter.'}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {filteredOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleValue(o.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-full font-mono text-[10px] uppercase font-bold border transition-colors',
                    values.includes(o.value)
                      ? 'bg-secondary text-white border-secondary'
                      : 'bg-white text-on-surface-variant border-border hover:border-secondary/50',
                  )}
                >
                  {o.value} · {o.count.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-5"
      >
        {submitting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
        {submitting ? 'Creating…' : 'Create Draft'}
      </Button>
    </form>
  );
}
