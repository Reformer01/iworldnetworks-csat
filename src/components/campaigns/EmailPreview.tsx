'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone, Code, Eye } from 'lucide-react';

interface EmailPreviewProps {
  subject: string;
  html: string;
  text: string;
  className?: string;
}

type ViewMode = 'desktop' | 'mobile' | 'html' | 'text';

export function EmailPreview({ subject, html, text, className }: EmailPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');

  const hasContent = subject || html || text;

  return (
    <div className={cn('rounded-xl border border-border/60 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-container-lowest border-b border-border/60">
        <div className="flex items-center gap-1">
          <Eye className="w-3.5 h-3.5 text-on-surface-variant/50" />
          <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/50">
            Preview
          </span>
        </div>
        <div className="flex gap-1">
          {([
            { id: 'desktop' as ViewMode, icon: Monitor, label: 'Desktop' },
            { id: 'mobile' as ViewMode, icon: Smartphone, label: 'Mobile' },
            { id: 'html' as ViewMode, icon: Code, label: 'HTML' },
            { id: 'text' as ViewMode, icon: Code, label: 'Text' },
          ]).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md font-mono text-[9px] uppercase font-bold transition-colors',
                viewMode === id
                  ? 'bg-secondary text-white'
                  : 'text-on-surface-variant/60 hover:bg-surface-container-low'
              )}
              title={label}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Subject line */}
      {subject && (
        <div className="px-4 py-2 bg-white border-b border-border/40">
          <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/50 mb-0.5">Subject</p>
          <p className="font-mono text-xs font-bold text-primary">{subject}</p>
        </div>
      )}

      {/* Preview content */}
      <div className="bg-white">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Eye className="w-8 h-8 text-on-surface-variant/20 mb-2" />
            <p className="font-mono text-[10px] text-on-surface-variant/40 uppercase font-bold">
              No content to preview
            </p>
            <p className="font-mono text-[9px] text-on-surface-variant/30 mt-1">
              Select a template or write your email content
            </p>
          </div>
        ) : viewMode === 'desktop' ? (
          <div className="p-4">
            <div className="mx-auto max-w-[600px] border border-border/40 rounded-lg overflow-hidden">
              {html ? (
                <iframe
                  srcDoc={html}
                  title="Email preview (desktop)"
                  className="w-full border-0"
                  style={{ minHeight: '300px' }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <pre className="p-4 font-mono text-xs text-primary whitespace-pre-wrap break-words">
                  {text}
                </pre>
              )}
            </div>
          </div>
        ) : viewMode === 'mobile' ? (
          <div className="flex justify-center p-4 bg-zinc-50">
            <div className="w-[375px] border-2 border-zinc-300 rounded-2xl overflow-hidden shadow-lg">
              {/* Phone frame */}
              <div className="bg-zinc-200 px-4 py-1 flex items-center justify-center">
                <div className="w-16 h-1 bg-zinc-400 rounded-full" />
              </div>
              <div className="bg-white">
                {html ? (
                  <iframe
                    srcDoc={html}
                    title="Email preview (mobile)"
                    className="w-full border-0"
                    style={{ minHeight: '400px' }}
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <pre className="p-4 font-mono text-xs text-primary whitespace-pre-wrap break-words">
                    {text}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ) : viewMode === 'html' ? (
          <div className="p-4">
            <pre className="bg-zinc-50 rounded-lg p-4 font-mono text-[10px] text-on-surface-variant overflow-auto max-h-[400px] whitespace-pre-wrap break-words">
              {html || '<!-- No HTML content -->'}
            </pre>
          </div>
        ) : (
          <div className="p-4">
            <pre className="bg-zinc-50 rounded-lg p-4 font-mono text-[10px] text-on-surface-variant overflow-auto max-h-[400px] whitespace-pre-wrap break-words">
              {text || 'No text content'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
