import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../cn';

export function Toast({ show, message }: { show: boolean; message: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+8rem)]",
        "bg-[#1C1C1E] text-white px-6 sm:px-8 py-3.5 sm:py-4 rounded-full font-black text-sm sm:text-sm shadow-2xl transition-all duration-300 z-[100] pointer-events-none tracking-tight flex items-center whitespace-nowrap",
        show ? "opacity-100 -translate-y-4" : "opacity-0"
      )}
    >
      <CheckCircle2 className="w-4 h-4 mr-2.5 text-secondary" />
      {message}
    </div>
  );
}
