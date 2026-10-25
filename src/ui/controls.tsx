import { useState, type ReactNode } from 'react';
import { formatLength, parseLength, type DisplayUnits } from '../core/units';
import { Icon } from './icons';

export function Section({ title, summary, children, defaultOpen = true, badge }: { title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; badge?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <button className="section-head" onClick={() => setOpen(!open)}>
        <span className="section-title">{title}</span>
        {badge && <span className="round-badge">{badge}</span>}
        {!open && summary && <span className="section-summary">{summary}</span>}
        <span className="chev"><Icon.chevron /></span>
      </button>
      <div className="section-body"><div>{children}</div></div>
    </section>
  );
}

interface LengthProps {
  label: string;
  value: number;
  min: number; max: number; step: number;
  units: DisplayUnits;
  hint?: ReactNode;
  disabled?: boolean;
  onChange: (mm: number) => void;
}

/** Slider + exact numeric entry (mm internally; typed values accept 12.5 m, 40′6″, 4500 mm). */
export function LengthControl({ label, value, min, max, step, units, hint, disabled, onChange }: LengthProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const commit = () => {
    const mm = parseLength(text, units);
    setEditing(false);
    if (mm != null && Number.isFinite(mm)) onChange(Math.min(max, Math.max(min, mm)));
  };
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <div className={`ctl ${disabled ? 'disabled' : ''}`}>
      <div className="ctl-row">
        <span className="ctl-label">{label}</span>
        {editing ? (
          <input className="ctl-input" autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <button className="ctl-value" disabled={disabled} title="Click to type an exact value (e.g. 12.5 m, 40′6″, 4500 mm)"
            onClick={() => { setText(formatLength(value, units, { precise: true }).replace(/ m$/, '')); setEditing(true); }}>
            {formatLength(value, units, { precise: true })}
          </button>
        )}
      </div>
      {max > min && <input type="range" className="slider" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }} onChange={(e) => onChange(+e.target.value)} />}
      {hint && <div className="ctl-hint">{hint}</div>}
    </div>
  );
}

export function NumberControl({ label, value, min, max, step, suffix, onChange, disabled, hint, format }: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void; disabled?: boolean; hint?: ReactNode; format?: (v: number) => string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const pct = ((value - min) / (max - min)) * 100;
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text.replace(/[, ]/g, ''));
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <div className={`ctl ${disabled ? 'disabled' : ''}`}>
      <div className="ctl-row">
        <span className="ctl-label">{label}</span>
        {editing ? (
          <input className="ctl-input" autoFocus value={text} onChange={(e) => setText(e.target.value)}
            onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <span className="stepper">
            <button disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}>−</button>
            <button className="ctl-value" disabled={disabled} onClick={() => { setText(String(value)); setEditing(true); }}>{format ? format(value) : value}{suffix}</button>
            <button disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(3)))}>+</button>
          </span>
        )}
      </div>
      <input type="range" className="slider" min={min} max={max} step={step} value={value} disabled={disabled} style={{ ['--pct' as string]: `${pct}%` }} onChange={(e) => onChange(+e.target.value)} />
      {hint && <div className="ctl-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span className="ctl-label">{label}</span>
      <button role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size, wrap }: { value: T; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; onChange: (v: T) => void; size?: 'sm'; wrap?: boolean }) {
  return (
    <div className={`segmented ${size ?? ''} ${wrap ? 'wrap' : ''}`}>
      {options.map((o) => (
        <button key={o.value} title={o.title} disabled={o.disabled} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return <div className="kv"><span>{k}</span><span className={tone}>{v}</span></div>;
}

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${tone ?? ''}`}>{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}
