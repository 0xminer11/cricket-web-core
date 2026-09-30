import type { ComponentProps, ReactNode } from 'react';
export function Button(props: ComponentProps<'button'>) {
  return <button {...props} className={`button ${props.className ?? ''}`} />;
}
export function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>;
}
export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={`input ${props.className ?? ''}`} />;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Spinner() {
  return <span role="status">Loading…</span>;
}
