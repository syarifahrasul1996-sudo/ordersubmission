import React, { ReactNode } from 'react';
import { cn } from '../cn';

export function ViewSection({ 
  id, 
  active, 
  children, 
  className 
}: { 
  id: string; 
  active: boolean; 
  children: ReactNode; 
  className?: string; 
}) {
  if (!active) return null;
  return (
    <div
      id={id}
      className={cn(
        "flex-col transition-all duration-400 ease-out",
        active ? "flex opacity-100 translate-y-0" : "hidden opacity-0 translate-y-3",
        className
      )}
    >
      {children}
    </div>
  );
}
