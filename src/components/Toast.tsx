import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../cn';

export function Toast({
  show,
  message,
  variant = 'top'
}: {
  show: boolean;
  message: string;
  variant?: 'top' | 'bottom';
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="alert"
          initial={{
            opacity: 0,
            y: variant === 'top' ? -36 : 36,
            scale: 0.9,
            x: "-50%"
          }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            x: "-50%"
          }}
          exit={{
            opacity: 0,
            y: variant === 'top' ? -20 : 20,
            scale: 0.92,
            x: "-50%"
          }}
          transition={{ type: "spring", stiffness: 450, damping: 28 }}
          className={cn(
            "fixed left-1/2 z-[100] pointer-events-none tracking-tight flex items-center whitespace-nowrap shadow-2xl border border-emerald-500/30 bg-gray-900/95 dark:bg-zinc-900/95 backdrop-blur-md text-white font-extrabold text-xs sm:text-sm px-5 py-3.5 rounded-2xl",
            variant === 'top'
              ? "top-4 sm:top-6"
              : "bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+8rem)]"
          )}
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.05 }}
            className="w-6 h-6 mr-3 flex items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 shrink-0 border border-emerald-500/40 shadow-sm shadow-emerald-500/30"
          >
            <svg
              className="w-3.5 h-3.5 stroke-emerald-400"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.1 }}
              />
            </svg>
          </motion.div>
          <span className="text-white font-extrabold tracking-tight">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

