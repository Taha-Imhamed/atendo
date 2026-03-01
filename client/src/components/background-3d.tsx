import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

export default function Background3D() {
  const reduceMotion = useReducedMotion();
  const [lowPowerMode, setLowPowerMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const smallScreen = window.innerWidth < 768;
      const lowCpu =
        typeof navigator !== "undefined" &&
        typeof navigator.hardwareConcurrency === "number" &&
        navigator.hardwareConcurrency <= 4;
      setLowPowerMode(smallScreen || lowCpu);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (lowPowerMode || reduceMotion) {
    return (
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-12 -left-12 w-56 h-56 rounded-full blur-3xl [background:color-mix(in_oklab,var(--color-primary)_16%,transparent)]" />
        <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full blur-3xl [background:color-mix(in_oklab,var(--color-accent)_12%,transparent)]" />
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full blur-[100px] [background:color-mix(in_oklab,var(--color-primary)_20%,transparent)]" />
      <div className="absolute top-40 -right-24 w-[28rem] h-[28rem] rounded-full blur-[120px] [background:color-mix(in_oklab,var(--color-secondary)_18%,transparent)]" />
      <div className="absolute bottom-0 left-1/3 w-[32rem] h-[32rem] rounded-full blur-[140px] [background:color-mix(in_oklab,var(--color-accent)_14%,transparent)]" />

      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          x: [0, -120, 0],
          y: [0, 90, 0],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -top-24 left-1/4 h-[520px] w-[520px] rounded-full blur-[130px] [background:color-mix(in_oklab,var(--color-primary)_14%,transparent)]"
      />

      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          x: [0, 80, 0],
          y: [0, -120, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -bottom-24 right-1/4 h-[600px] w-[600px] rounded-full blur-[140px] [background:color-mix(in_oklab,var(--color-secondary)_12%,transparent)]"
      />

      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 opacity-10"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 16%, transparent) 0%, transparent 70%)",
        }}
      />
    </div>
  );
}
