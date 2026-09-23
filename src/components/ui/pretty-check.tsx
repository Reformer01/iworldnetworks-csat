'use client';

/** Pretty checkbox extracted from the auth-section kit. */
export function PrettyCheck({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      <span className="relative mt-0.5 size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          className="peer size-full cursor-pointer appearance-none rounded-[4px] border border-slate-300 bg-white transition-colors checked:border-[#448515] checked:bg-[#448515]"
        />
        <svg viewBox="0 0 12 12" className="pointer-events-none absolute inset-0 hidden size-full p-[3px] text-white peer-checked:block" fill="none" aria-hidden="true">
          <path d="M3 6.2 5 8.1 9 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="text-[13px] leading-snug">{label}</span>}
    </label>
  );
}
