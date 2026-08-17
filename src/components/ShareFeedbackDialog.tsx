'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Copy, MessageCircle, Mail, CheckCircle2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FEEDBACK_CATEGORIES, getCategoryLabel } from '@/lib/splynx-categories';
import { staffRoster } from '@/lib/staff';
import { useFeedbackShare } from '@/hooks/use-feedback-share';

export interface ShareDialogCustomer {
  customerName: string;
  customerEmail: string;
  servicePlan?: string;
  location?: string;
  phone?: string;
}

interface ShareFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: ShareDialogCustomer | null;
  defaultSubject?: string;
}

function buildWhatsAppText(url: string, customerName: string, subject: string): string {
  const label = getCategoryLabel(subject);
  return `Hello ${customerName}, we'd love your feedback on your recent ${label.toLowerCase()} experience with I-World Networks. Please take a moment to share your thoughts: ${url}`;
}

function buildEmailText(customerName: string, subject: string, url: string): string {
  const label = getCategoryLabel(subject);
  return `Dear ${customerName},\n\nThank you for choosing I-World Networks. We'd love to hear about your recent ${label.toLowerCase()} experience. Please take 1 minute to share your feedback:\n\n${url}\n\nYour feedback helps us serve you better.\n\n— I-World Networks`;
}

export default function ShareFeedbackDialog({ open, onOpenChange, customer, defaultSubject }: ShareFeedbackDialogProps) {
  const { loading, result, error, generate, reset } = useFeedbackShare();
  const [subject, setSubject] = useState<string>(defaultSubject || 'Support');
  const [staffName, setStaffName] = useState<string>('');
  const [serviceDate, setServiceDate] = useState<string>('');
  const [copied, setCopied] = useState<'link' | 'whatsapp' | 'email' | null>(null);

  useEffect(() => {
    if (open) {
      reset();
      setSubject(defaultSubject || 'Support');
      setStaffName('');
      setServiceDate(new Date().toISOString().slice(0, 10));
      setCopied(null);
    }
  }, [open, defaultSubject, reset]);

  const handleGenerate = async () => {
    if (!customer) return;
    await generate({
      customerName: customer.customerName,
      customerEmail: customer.customerEmail,
      servicePlan: customer.servicePlan,
      location: customer.location,
      serviceDate,
      subject,
      staffName: staffName || undefined,
    });
  };

  const handleCopy = (text: string, type: 'link' | 'whatsapp' | 'email') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  // The popup URL (subject-scoped, embeddable form) is the canonical share
  // link here — it works standalone in any browser and inside iframes too.
  const shareUrl = result?.popupUrl || result?.url || '';
  const whatsappPhone = customer?.phone ? customer.phone.replace(/\D/g, '') : '';
  const whatsappUrl = result
    ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(buildWhatsAppText(shareUrl, customer?.customerName || 'there', subject))}`
    : '';
  const emailBody = result ? buildEmailText(customer?.customerName || '', subject, shareUrl) : '';
  const mailtoUrl = result
    ? `mailto:${encodeURIComponent(customer?.customerEmail || '')}?subject=${encodeURIComponent('Share your feedback with I-World Networks')}&body=${encodeURIComponent(emailBody)}`
    : '';

  // Staff list filtered to those relevant to the selected subject
  const relevantStaff = staffRoster.filter((s) => !subject || (s.categories as string[]).includes(subject));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-3xl p-8">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-tight flex items-center gap-2">
            <Link2 className="w-5 h-5 text-secondary" /> Share Feedback Link
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase font-bold opacity-60">
            Send the customer a link that points directly at one subject
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {customer && (
            <div className="rounded-xl bg-muted/40 p-3 border border-border/40 text-xs space-y-1">
              <p className="font-semibold text-primary">{customer.customerName}</p>
              <p className="font-mono text-[10px] text-on-surface-variant/70 truncate">{customer.customerEmail}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Subject</label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {getCategoryLabel(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Staff / Technician (optional)</label>
            <Select value={staffName} onValueChange={setStaffName}>
              <SelectTrigger className="rounded-md font-mono text-[10px] uppercase font-bold bg-white">
                <SelectValue placeholder="No specific staff member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No specific staff member</SelectItem>
                {relevantStaff.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name} — {getCategoryLabel(s.categories[0] || '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Experience Date</label>
            <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} className="rounded-md" />
          </div>

          {error && (
            <p className="text-[11px] text-destructive font-semibold bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 p-3 space-y-3">
              <p className="font-mono text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Feedback link ready</p>
              <div className="flex gap-2 items-center">
                <code className="flex-1 min-w-0 truncate text-[11px] bg-white dark:bg-background border border-border rounded-md px-2 py-1.5">
                  {shareUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-8 w-8 p-0 rounded-lg"
                  onClick={() => handleCopy(shareUrl, 'link')}
                  aria-label="Copy link"
                >
                  {copied === 'link' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full font-mono text-[10px] uppercase font-bold"
                  onClick={() => handleCopy(whatsappUrl, 'whatsapp')}
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5 text-green-600" />
                  {copied === 'whatsapp' ? 'Copied' : 'Copy WhatsApp'}
                </Button>
                <a
                  href={mailtoUrl}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-background text-[10px] font-mono font-bold uppercase px-3 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 mr-1.5 text-sky-600" />
                  Send Email
                </a>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2 border-t border-border pt-6">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={loading || !customer}
            className="rounded-full bg-secondary text-white px-8"
            onClick={handleGenerate}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Link2 className="w-4 h-4 mr-2" />} Generate Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
