/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none" dir="rtl">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl backdrop-blur-xl border shadow-2xl transition-all ${
              toast.type === "success"
                ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-100"
                : toast.type === "error"
                ? "bg-rose-950/80 border-rose-500/30 text-rose-100"
                : "bg-slate-900/90 border-amber-500/30 text-amber-100"
            }`}
          >
            {toast.type === "success" && (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            )}
            {toast.type === "error" && (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            )}
            {toast.type === "info" && (
              <Info className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            )}
            
            <div className="flex-1 text-sm font-semibold leading-relaxed">
              {toast.message}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-200 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
