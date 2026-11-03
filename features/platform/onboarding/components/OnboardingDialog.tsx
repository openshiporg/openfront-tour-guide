'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { SECTIONS, TEMPLATES, type TemplateType } from '../config/templates';
import { getSeedForTemplate, itemsFor } from '../utils/dataUtils';
import { useOnboardingApi, type SectionState } from '../hooks/useOnboardingApi';
import seed from '../lib/seed.json';

const DOT: Record<string, string> = { idle: 'bg-muted-foreground/40', running: 'bg-amber-500 animate-pulse', done: 'bg-emerald-500', error: 'bg-rose-500' };

export default function OnboardingDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [template, setTemplate] = React.useState<TemplateType>('full');
  const [step, setStep] = React.useState<'template' | 'progress' | 'done'>('template');
  const [state, setState] = React.useState<SectionState>({});
  const [error, setError] = React.useState<string | null>(null);
  const data = React.useMemo(() => getSeedForTemplate(template, seed), [template]);
  const api = useOnboardingApi({
    template, data,
    onSection: (type, status, message) => setState((s) => ({ ...s, [type]: { status, error: message } })),
    onFinished: () => { setStep('done'); router.refresh(); },
    onFailed: (message) => setError(message),
  });
  const start = () => { setError(null); setState({}); setStep('progress'); void api.run(); };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Operator setup</DialogTitle>
          <DialogDescription>{step === 'template' ? 'Choose what to create.' : step === 'progress' ? 'Creating records.' : 'Setup complete.'}</DialogDescription>
        </DialogHeader>
        {step === 'template' && (
          <div className="space-y-4">
            <RadioGroup value={template} onValueChange={(v) => setTemplate(v as TemplateType)} className="space-y-2">
              {(Object.keys(TEMPLATES) as TemplateType[]).map((key) => (
                <Label key={key} htmlFor={`tpl-${key}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem id={`tpl-${key}`} value={key} className="mt-1" />
                  <span className="space-y-1"><span className="block text-sm font-medium">{TEMPLATES[key].name}</span><span className="block text-sm text-muted-foreground">{TEMPLATES[key].description}</span></span>
                </Label>
              ))}
            </RadioGroup>
            <Button onClick={start} className="w-full">Create</Button>
          </div>
        )}
        {step !== 'template' && (
          <ul className="space-y-2">
            {SECTIONS.map((section) => {
              const items = itemsFor(data, section.type);
              if (!items.length && section.type !== 'activity') return null;
              const status = state[section.type]?.status || 'idle';
              return (
                <li key={section.type} className="flex items-start gap-3 rounded-lg border p-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[status])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{section.label}</span><span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{status}</span></div>
                    <p className="truncate text-sm text-muted-foreground">{items.length > 3 ? `${items.slice(0, 3).join(', ')} +${items.length - 3}` : items.join(', ')}</p>
                    {state[section.type]?.error && <p className="text-sm text-rose-600">{state[section.type]?.error}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {error && <div className="space-y-2"><p className="text-sm text-rose-600">{error}</p><Button variant="outline" onClick={start}>Retry</Button></div>}
        {step === 'done' && <Button onClick={onClose}>Close</Button>}
      </DialogContent>
    </Dialog>
  );
}
