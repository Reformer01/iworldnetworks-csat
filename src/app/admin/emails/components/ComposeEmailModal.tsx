'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { composeManualEmail } from '@/hooks/use-emails';
import type { User } from 'firebase/auth';

export function ComposeEmailModal({
  open,
  onOpenChange,
  user,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setTo('');
    setCustomerName('');
    setSubject('');
    setText('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || sending) return;
    setSending(true);
    try {
      const result = await composeManualEmail(user, { to, customerName, subject, text });
      const awaitingApproval = result.status === 'pending_approval';
      toast({
        title: awaitingApproval ? 'Submitted for approval' : 'Email queued',
        description: awaitingApproval
          ? `${subject} will be sent once a super admin approves it.`
          : `${subject} will be sent to ${to}.`,
      });
      reset();
      onOpenChange(false);
      onSent();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Queue failed', description: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onOpenChange(false)}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-primary">Compose Email</DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-widest font-bold">
            Queues a manual email through the worker
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">To</Label>
            <Input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="customer@example.com"
              className="rounded-xl font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Customer Name</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Optional"
              className="rounded-xl font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Subject</Label>
            <Input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject"
              className="rounded-xl font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase font-bold text-on-surface-variant">Message</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Plain-text body"
              rows={5}
              className="rounded-xl font-mono text-xs"
            />
          </div>
          <Button
            type="submit"
            disabled={sending}
            className="w-full rounded-full bg-secondary text-white font-mono text-[10px] uppercase font-bold py-5"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-2" />}
            {sending ? 'Queuing...' : 'Queue Email'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}