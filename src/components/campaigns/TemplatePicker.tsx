'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { CAMPAIGN_TEMPLATES, type CampaignTemplate } from '@/lib/campaign-templates';
import { FileEdit, AlertTriangle, RefreshCw, Target } from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileEdit,
  AlertTriangle,
  RefreshCw,
  Target,
};

interface TemplatePickerProps {
  selectedId: string | null;
  onSelect: (template: CampaignTemplate) => void;
}

export function TemplatePicker({ selectedId, onSelect }: TemplatePickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display font-bold text-lg uppercase tracking-tight text-primary">
          Choose a Template
        </h3>
        <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/60 mt-1">
          Start from a pre-built template or blank canvas
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CAMPAIGN_TEMPLATES.map((template) => {
          const IconComponent = ICON_MAP[template.iconName] || FileEdit;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className={cn(
                'text-left p-4 rounded-xl border-2 transition-all hover:shadow-md',
                selectedId === template.id
                  ? 'border-secondary bg-secondary/5 shadow-md'
                  : 'border-border/60 bg-white hover:border-secondary/40'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-surface-container-low">
                  <IconComponent className="w-5 h-5 text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-sm text-primary">{template.name}</p>
                  <p className="font-mono text-[10px] text-on-surface-variant/60 mt-0.5 line-clamp-2">
                    {template.description}
                  </p>
                  {template.id !== 'blank' && (
                    <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-surface-container-low font-mono text-[8px] uppercase font-bold text-on-surface-variant/50">
                      {template.type}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
