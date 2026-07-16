"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type ToastVariant = "default" | "error";
type ToastMsg = { text: string; variant: ToastVariant };

let listeners: ((msg: ToastMsg) => void)[] = [];

export function toast(msg: string, variant: ToastVariant = "default") {
  listeners.forEach((l) => l({ text: msg, variant }));
}

export function Toaster() {
  const [message, setMessage] = useState<ToastMsg | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = (msg: ToastMsg) => {
      setMessage(msg);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 2000);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className={`fixed bottom-20 inset-x-4 z-50 rounded-2xl text-white text-sm px-4 py-3 shadow-lg ${message.variant === "error" ? "bg-danger" : "bg-text"}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          {message.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
