/**
 * Legacy KPI cards used to render the metric icon inside a coloured chip
 * (`bg-emerald-600` square with a white glyph). The reference dashboards never
 * do that - the icon sits bare and inherits a single brand/status colour.
 *
 * This maps the old chip background to the bare-icon text colour. The Tailwind
 * literals live here (not built by string concatenation) so the JIT compiler
 * still emits them.
 */
export function iconToneClass(color?: string): string {
  if (!color) return 'text-muted-foreground';
  const token = color.trim().split(/\s+/).find((c) => c.startsWith('text-') || c.startsWith('bg-'));
  if (!token) return 'text-muted-foreground';
  if (token.startsWith('text-')) return token;

  switch (token) {
    case 'bg-slate-900':
    case 'bg-zinc-900':
    case 'bg-black':
      return 'text-foreground';
    case 'bg-secondary':
      return 'text-secondary';
    case 'bg-emerald-500':
    case 'bg-emerald-600':
      return 'text-emerald-600';
    case 'bg-green-500':
    case 'bg-green-600':
      return 'text-green-600';
    case 'bg-sky-500':
    case 'bg-sky-600':
      return 'text-sky-600';
    case 'bg-blue-500':
    case 'bg-blue-600':
      return 'text-blue-600';
    case 'bg-orange-500':
      return 'text-orange-500';
    case 'bg-amber-500':
    case 'bg-amber-600':
      return 'text-amber-600';
    case 'bg-rose-500':
    case 'bg-rose-600':
      return 'text-rose-600';
    case 'bg-red-500':
      return 'text-red-600';
    case 'bg-violet-500':
    case 'bg-violet-600':
      return 'text-violet-600';
    case 'bg-indigo-500':
    case 'bg-indigo-600':
      return 'text-indigo-600';
    case 'bg-teal-500':
      return 'text-teal-600';
    case 'bg-purple-500':
    case 'bg-purple-600':
      return 'text-purple-600';
    default:
      return 'text-muted-foreground';
  }
}
