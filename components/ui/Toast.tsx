"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

let listeners: ((msg: string) => void)[] = [];

export function toast(msg: string) {
  listeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = (msg: string) => {
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
          className="fixed bottom-20 inset-x-4 z-50 rounded-2xl bg-text text-white text-sm px-4 py-3 shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
