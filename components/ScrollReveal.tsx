'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Enable staggered reveal for direct children */
  stagger?: boolean;
  /** Customize the IntersectionObserver threshold (0–1) */
  threshold?: number;
}

export default function ScrollReveal({
  children,
  className,
  stagger = false,
  threshold = 0.15,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' },
    );

    if (stagger) {
      // Observe each direct child that has the scroll-reveal class
      const children = el.querySelectorAll(':scope > .scroll-reveal');
      children.forEach((child) => observer.observe(child));
      // Also observe the container itself
      observer.observe(el);
    } else {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [threshold, stagger]);

  return (
    <div
      ref={ref}
      className={cn(
        'scroll-reveal',
        stagger && 'scroll-reveal-stagger',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Small helper for section numbers like "01 COLLECTION" */
export function SectionLabel({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <span className="section-number mb-4 block">
      {number} {label}
    </span>
  );
}
