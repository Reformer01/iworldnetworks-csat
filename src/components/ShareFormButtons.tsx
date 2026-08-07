'use client';

import React, { useState } from 'react';
import { Copy, MessageCircle, Mail, CheckCircle2, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface ShareFormButtonsProps {
  url: string;
  customerName?: string;
  subject?: string;
  label?: string;
  compact?: boolean;
  className?: string;
}

function buildWhatsAppText(url: string, customerName: string, subject: string): string {
  const who = customerName || 'there';
  const topic = subject || 'your recent experience';
  return `Hello ${who}, could you share your feedback on ${topic} with I-World Networks? It only takes a minute: ${url}`;
}

const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

export default function ShareFormButtons({
  url,
  customerName,
  subject,
  label = 'Share this survey',
  compact = false,
  className,
}: ShareFormButtonsProps) {
  const [copied, setCopied] = useState<'link' | 'whatsapp' | 'email' | null>(null);
  const disabled = !url;

  const handleCopy = async (text: string, type: 'link' | 'whatsapp' | 'email') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable — no-op
    }
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const whatsappUrl = url
    ? `https://wa.me/?text=${encodeURIComponent(buildWhatsAppText(url, customerName || 'there', subject || ''))}`
    : '';
  const emailBody = url
    ? `Dear ${customerName || 'Customer'},\n\nWe'd appreciate your quick feedback on ${subject || 'your recent experience'} with I-World Networks:\n\n${url}\n\nThank you!`
    : '';
  const mailtoUrl = url
    ? `mailto:?subject=${encodeURIComponent('Share your feedback with I-World Networks')}&body=${encodeURIComponent(emailBody)}`
    : '';

  const nativeShare = async (): Promise<boolean> => {
    if (!url || !hasNativeShare) return false;
    try {
      await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
        title: 'I-World Networks feedback',
        text: buildWhatsAppText(url, customerName || 'there', subject || ''),
        url,
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleShare = async (type: 'link' | 'whatsapp' | 'email') => {
    if (type === 'link') {
      // Prefer the native share sheet where available (mobile), else copy the link.
      if (hasNativeShare) {
        const ok = await nativeShare();
        if (ok) return;
      }
      return handleCopy(url, 'link');
    }
    if (type === 'whatsapp') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      return handleCopy(whatsappUrl, 'whatsapp');
    }
    // email: prefer mailto; fall back to copying the link
    window.open(mailtoUrl, '_blank');
    await handleCopy(url, 'email');
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {!compact && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={disabled}
          aria-label="Copy link"
          onClick={() => handleShare('link')}
          title="Copy link"
        >
          {copied === 'link' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={disabled}
          aria-label="Share on WhatsApp"
          onClick={() => handleShare('whatsapp')}
          title="Share on WhatsApp"
        >
          <MessageCircle className="w-4 h-4 text-green-600" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          disabled={disabled}
          aria-label="Share via email"
          onClick={() => handleShare('email')}
          title="Share via email"
        >
          <Mail className="w-4 h-4 text-sky-600" />
        </Button>
        {hasNativeShare && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            disabled={disabled}
            aria-label="More share options"
            onClick={() => handleShare('link')}
            title="More options"
          >
            <Share2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
