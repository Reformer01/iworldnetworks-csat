'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, Users, ArrowLeft, ArrowRight, Check, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createCampaign, fetchSegments, fetchAudienceCount, type CampaignSegmentOptions } from '@/hooks/use-campaigns';
import { TemplatePicker } from './TemplatePicker';
import { EmailPreview } from './EmailPreview';
import { getTemplate, renderTemplate, type CampaignTemplate } from '@/lib/campaign-templates';
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

type Step = 'template' | 'content' | 'audience' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'template', label: 'Template' },
  { id: 'content', label: 'Content' },
  { id: 'audience', label: 'Audience' },
  { id: 'review', label: 'Review' },
];

export function CampaignForm({ user, onCreated }: { user: User; onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<CampaignTemplate | null>(null);
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
  const [sendMode, setSendMode] = useState<'draft' | 'review' | 'send' | 'schedule'>('draft');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  useEffect(() => {
    fetchSegments(user)
      .then(setOptions)
      .catch(() => setOptions(null));
  }, [user]);

  // Apply template when selected
  const handleTemplateSelect = (template: CampaignTemplate) => {
    setSelectedTemplate(template);
    if (template.id !== 'blank') {
      setSubject(template.subject);
      setText(template.text);
      setHtml(template.html);
      setType(template.type);
      // Auto-set campaign name from template
      if (!name) {
        setName(template.name);
      }
    }
    setStep('content');
  };

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

  const optionList = audienceType === 'all' ? [] : options?.[audienceType as keyof CampaignSegmentOptions] || [];
  const filteredOptions = optionSearch.trim()
    ? optionList.filter((o) => o.value.toLowerCase().includes(optionSearch.trim().toLowerCase()))
    : optionList;
  const selectedCount = optionList.filter((o) => values.includes(o.value)).reduce((sum, o) => sum + o.count, 0);

  // Preview with sample data
  const previewHtml = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.id === 'blank') return html;
    return renderTemplate(selectedTemplate);
  }, [selectedTemplate, html]);

  const previewText = useMemo(() => {
    if (!selectedTemplate || selectedTemplate.id === 'blank') return text;
    const tmpl = getTemplate(selectedTemplate.id);
    if (!tmpl) return text;
    return renderTemplate(tmpl);
  }, [selectedTemplate, text]);

  const handleSubmit = async () => {
    if (!name.trim() || !subject.trim() || !text.trim()) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Name, subject and text are required.' });
      return;
    }
    if (sendMode === 'schedule') {
      if (!scheduledDate || !scheduledTime) {
        toast({ variant: 'destructive', title: 'Missing schedule', description: 'Pick a date and time to schedule the campaign.' });
        return;
      }
      const scheduledMs = new Date(`${scheduledDate}T${scheduledTime}`).getTime();
      if (isNaN(scheduledMs) || scheduledMs <= Date.now()) {
        toast({ variant: 'destructive', title: 'Invalid schedule', description: 'The scheduled time must be in the future.' });
        return;
      }
    }
    setSubmitting(true);
    try {
      const scheduledAtMs =
        sendMode === 'schedule' && scheduledDate && scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}`).getTime() : undefined;
      const { id } = await createCampaign(user, {
        name,
        type,
        subject,
        html,
        text,
        audience,
        scheduledAt: scheduledAtMs,
        action: sendMode === 'send' ? 'send' : sendMode === 'schedule' ? 'send' : undefined,
      });
      // If review mode, immediately submit for review
      if (sendMode === 'review') {
        const { campaignAction } = await import('@/hooks/use-campaigns');
        await campaignAction(user, id, 'submit_for_review');
      }
      if (sendMode === 'draft') {
        toast({ title: 'Draft created', description: 'Edit it, then submit for review when ready.' });
      } else if (sendMode === 'review') {
        toast({ title: 'Submitted for review', description: 'A super admin will review and approve your campaign.' });
      } else if (sendMode === 'schedule') {
        toast({ title: 'Campaign scheduled', description: `Will send on ${scheduledDate} at ${scheduledTime}` });
      } else {
        toast({ title: 'Campaign created & sending', description: 'Emails are being sent now.' });
      }
      onCreated(id);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Create failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'template':
        return true; // Can always proceed from template
      case 'content':
        return name.trim() && subject.trim() && text.trim();
      case 'audience':
        return true;
      case 'review':
        return true;
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button
              type="button"
              onClick={() => {
                // Can only go back, or forward if current step is valid
                if (i < stepIndex) setStep(s.id);
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] uppercase font-bold transition-colors',
                step === s.id
                  ? 'bg-secondary text-white'
                  : i < stepIndex
                    ? 'bg-emerald-100 text-emerald-700 cursor-pointer hover:bg-emerald-200'
                    : 'bg-surface-container-low text-on-surface-variant/40',
              )}
            >
              {i < stepIndex ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[8px]">{i + 1}</span>
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <div className={cn('h-px flex-1', i < stepIndex ? 'bg-emerald-300' : 'bg-border/40')} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step content */}
      {step === 'template' && <TemplatePicker selectedId={selectedTemplate?.id ?? null} onSelect={handleTemplateSelect} />}

      {step === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Campaign name"
                  className="rounded-xl font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="rounded-xl font-mono text-xs">
                    <SelectValue />
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

            <div className="space-y-1">
              <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Subject *</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject line"
                className="rounded-xl font-mono text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Plain text body *</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="Plain text version (required)"
                className="rounded-xl font-mono text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">HTML body (optional)</Label>
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={6}
                placeholder="<p>HTML version</p>"
                className="rounded-xl font-mono text-xs"
              />
            </div>

            {selectedTemplate && selectedTemplate.id !== 'blank' && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplate(null);
                  setStep('template');
                }}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase font-bold text-on-surface-variant/60 hover:text-secondary transition-colors"
              >
                <ArrowLeft className="w-3 h-3" />
                Change template
              </button>
            )}
          </div>

          {/* Preview */}
          <div className="lg:sticky lg:top-20 lg:self-start">
            <EmailPreview subject={subject} html={previewHtml} text={previewText} />
          </div>
        </div>
      )}

      {step === 'audience' && (
        <div className="space-y-4">
          <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-border">
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
              <div className="mt-4 space-y-2">
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
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-border">
            <h3 className="font-display font-bold text-sm uppercase text-primary mb-3">Campaign Summary</h3>
            <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <dt className="text-on-surface-variant/60 text-[9px] uppercase">Name</dt>
                <dd className="font-bold text-primary">{name || '—'}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant/60 text-[9px] uppercase">Type</dt>
                <dd className="font-bold text-primary">{type}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-on-surface-variant/60 text-[9px] uppercase">Subject</dt>
                <dd className="font-bold text-primary">{subject || '—'}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant/60 text-[9px] uppercase">Template</dt>
                <dd className="font-bold text-primary">{selectedTemplate?.name || 'Blank'}</dd>
              </div>
              <div>
                <dt className="text-on-surface-variant/60 text-[9px] uppercase">Audience</dt>
                <dd className="font-bold text-primary">
                  {audienceType === 'all' ? 'All customers' : `${audienceType} (${values.length} selected)`}
                </dd>
              </div>
            </dl>
          </div>

          {/* Send mode selector */}
          <div className="bg-surface-container-low/50 p-4 rounded-2xl border border-border">
            <h3 className="font-display font-bold text-sm uppercase text-primary mb-3">When to Send</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'draft' as const, label: 'Save as Draft', desc: 'Save for later editing', icon: null },
                { id: 'review' as const, label: 'Submit for Review', desc: 'Send to super admin for approval', icon: Send },
                { id: 'send' as const, label: 'Approve & Send', desc: 'Super admin: approve and send now', icon: Send },
                { id: 'schedule' as const, label: 'Schedule', desc: 'Pick a date & time', icon: Clock },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSendMode(opt.id)}
                  className={cn(
                    'p-3 rounded-xl border-2 text-left transition-all',
                    sendMode === opt.id ? 'border-secondary bg-secondary/10' : 'border-border hover:border-secondary/40',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {opt.icon && <opt.icon className="w-4 h-4 text-secondary" />}
                    <span className="font-mono text-[10px] uppercase font-bold text-primary">{opt.label}</span>
                  </div>
                  <span className="font-mono text-[9px] text-on-surface-variant/60">{opt.desc}</span>
                </button>
              ))}
            </div>

            {sendMode === 'schedule' && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Date</Label>
                  <Input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-mono text-[9px] uppercase font-bold text-on-surface-variant">Time</Label>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="rounded-xl font-mono text-xs"
                  />
                </div>
                {scheduledDate && scheduledTime && (
                  <span className="font-mono text-[10px] text-secondary font-bold flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString('en-NG', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            )}
          </div>

          <EmailPreview subject={subject} html={previewHtml} text={previewText} />
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-border/40">
        <div>
          {stepIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(STEPS[stepIndex - 1].id)}
              className="rounded-full font-mono text-[10px] uppercase font-bold"
            >
              <ArrowLeft className="w-3 h-3 mr-1.5" />
              Back
            </Button>
          )}
        </div>
        <div>
          {stepIndex < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep(STEPS[stepIndex + 1].id)}
              disabled={!canProceed()}
              className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-6"
            >
              Next
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canProceed()}
              className="rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold px-8"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
              {submitting
                ? 'Creating…'
                : sendMode === 'send'
                  ? 'Approve & Send'
                  : sendMode === 'schedule'
                    ? 'Schedule Campaign'
                    : sendMode === 'review'
                      ? 'Submit for Review'
                      : 'Create Draft'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
