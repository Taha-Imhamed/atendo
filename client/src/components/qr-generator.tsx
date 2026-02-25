import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface QRCodeGeneratorProps {
  payload: string | null;
  expiresAt?: string | null;
  roundNumber?: number | null;
}

export default function QRCodeGenerator({
  payload,
  expiresAt,
  roundNumber,
}: QRCodeGeneratorProps) {
  const [qrSize, setQrSize] = useState(240);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [initialDuration, setInitialDuration] = useState<number | null>(null);

  useEffect(() => {
    const updateSize = () => {
      if (typeof window === "undefined") return;
      const availableWidth = window.innerWidth - 64;
      const calculated = Math.min(
        320,
        Math.max(200, Math.floor(availableWidth * 0.7)),
      );
      setQrSize(calculated);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft(null);
      setInitialDuration(null);
      return;
    }

    const target = new Date(expiresAt).getTime();
    const computeSeconds = () => Math.max(0, Math.round((target - Date.now()) / 1000));
    const first = computeSeconds();
    setInitialDuration(first || null);
    setTimeLeft(first);

    const timer = setInterval(() => {
      setTimeLeft(computeSeconds());
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, payload]);

  const progressPercent =
    initialDuration && timeLeft !== null && initialDuration > 0
      ? Math.max(0, Math.min(100, (timeLeft / initialDuration) * 100))
      : 100;

  if (!payload) {
    return (
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-2xl shadow-xl border border-border max-w-sm w-full mx-auto text-center space-y-2">
        <p className="text-sm text-muted-foreground">Waiting for an active round...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-2xl shadow-xl border border-border max-w-sm w-full mx-auto">
      <motion.div className="relative mb-6 perspective-1000 preserve-3d">
        <div className="absolute -inset-2 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl blur opacity-20 animate-pulse"></div>
        <div className="relative bg-white p-6 rounded-2xl border border-primary/10 shadow-inner">
          <AnimatePresence mode="wait">
            <motion.div
              key={payload}
              initial={{ opacity: 0.8, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0.8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <QRCodeSVG 
                value={payload} 
                size={qrSize} 
                level="H"
                includeMargin={true}
                className="rounded-lg"
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      
      <div className="w-full space-y-2 text-center">
        <h3 className="font-heading font-semibold text-lg text-primary">
          Scan to Check In {roundNumber ? `(Round ${roundNumber})` : ""}
        </h3>
        <p className="text-sm text-muted-foreground">
          {timeLeft !== null ? `Expires in ${timeLeft}s` : "Token active"}
        </p>
        
        <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-4">
          <motion.div 
            className="h-full bg-accent"
            initial={{ width: "100%" }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.8, ease: "linear" }}
          />
        </div>
      </div>
    </div>
  );
}
