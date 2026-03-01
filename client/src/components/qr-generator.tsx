import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

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
        360,
        Math.max(180, Math.floor(availableWidth * 0.8)),
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
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-card rounded-2xl shadow-xl border border-border max-w-sm w-full mx-auto text-center space-y-2">
        <p className="text-sm text-muted-foreground">Waiting for an active round...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-card rounded-2xl shadow-xl border border-border max-w-md w-full mx-auto">
      <div className="relative mb-6 bg-white p-2 sm:p-3 rounded-2xl border-4 border-black">
        <QRCodeSVG
          value={payload}
          size={qrSize}
          level="M"
          includeMargin={true}
          className="rounded-lg"
          bgColor="#ffffff"
          fgColor="#000000"
        />
      </div>
      
      <div className="w-full space-y-2 text-center">
        <h3 className="font-heading font-semibold text-lg text-primary">
          Scan to Check In {roundNumber ? `(Round ${roundNumber})` : ""}
        </h3>
        <p className="text-sm text-muted-foreground">
          {timeLeft !== null ? `Expires in ${timeLeft}s` : "Token active"}
        </p>
        
        <div className="w-full bg-muted h-2 rounded-full overflow-hidden mt-4">
          <div
            className="h-full bg-accent transition-[width] duration-700 linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
