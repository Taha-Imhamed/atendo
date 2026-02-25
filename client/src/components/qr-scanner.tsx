import { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ScanStatus = "idle" | "processing" | "success" | "error";

export interface ScanResult {
  success: boolean;
  message?: string;
}

interface QRScannerProps {
  onScan: (decodedText: string) => Promise<ScanResult>;
}

export default function QRScanner({ onScan }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [qrBoxSize, setQrBoxSize] = useState(260);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);

  useEffect(() => {
    const updateSize = () => {
      if (typeof window === "undefined") return;
      const calculated = Math.min(340, Math.max(220, Math.floor(window.innerWidth * 0.75)));
      setQrBoxSize(calculated);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    if (!scannerActive) {
      return;
    }

    setError(null);
    setResultMessage(null);
    setStatus("idle");

    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => undefined);
    }

    const scanner = new Html5QrcodeScanner(
      "reader",
      {
        fps: 10,
        qrbox: { width: qrBoxSize, height: qrBoxSize },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      },
      false,
    );

    scannerRef.current = scanner;

    const stopScanner = () => {
      scanner
        .clear()
        .catch(() => undefined)
        .finally(() => setScannerActive(false));
    };

    scanner.render(
      (decodedText) => {
        stopScanner();
        setStatus("processing");

        void (async () => {
          try {
            const result = await onScan(decodedText);
            setResultMessage(
              result?.message ?? "Attendance recorded successfully.",
            );
            setStatus(result?.success === false ? "error" : "success");
          } catch (err) {
            setResultMessage(
              err instanceof Error
                ? err.message
                : "Could not record attendance.",
            );
            setStatus("error");
          }
        })();
      },
      (errorMessage) => {
        const lower = errorMessage.toLowerCase();
        if (lower.includes("permission") || lower.includes("denied")) {
          setError(
            "Camera access was blocked. Reload and allow the camera to continue scanning.",
          );
          setScannerActive(false);
        }
      },
    );

    return () => {
      scanner.clear().catch(() => undefined);
    };
  }, [scannerActive, onScan, qrBoxSize]);

  const showResult = status === "success" || status === "error" || status === "processing";
  const canUseCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const isSecureContext =
    typeof window === "undefined" ||
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const requestCamera = async () => {
    if (!canUseCamera) {
      setError("Camera access is not supported in this browser.");
      return;
    }

    if (!isSecureContext) {
      setError("Camera access requires HTTPS. Open this site over HTTPS to continue.");
      return;
    }

    setRequestingPermission(true);
    setError(null);
    setResultMessage(null);
    setStatus("idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      stream.getTracks().forEach((track) => track.stop());
      setScannerActive(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Camera permission was denied. Please allow access and try again.";
      setError(message);
      setScannerActive(false);
    } finally {
      setRequestingPermission(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4" aria-live="polite">
      {!scannerActive && !showResult && (
        <Card className="p-6 bg-white/90 border border-border shadow-xl rounded-2xl text-center space-y-3">
          <p className="text-lg font-semibold text-slate-900">Allow camera access</p>
          <p className="text-sm text-muted-foreground">
            We need your camera to scan the QR code displayed by your professor. Tap the button below to open your camera and allow permission.
          </p>
          <Button
            variant="secondary"
            onClick={requestCamera}
            disabled={requestingPermission}
          >
            {requestingPermission ? "Requesting permission…" : "Open camera & start scanning"}
          </Button>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </Card>
      )}

      {scannerActive && (
        <div className="overflow-hidden rounded-2xl border-2 border-primary/20 shadow-xl bg-black relative">
          <div
            id="reader"
            className="w-full h-full min-h-[260px] sm:min-h-[320px]"
            style={{ minHeight: Math.max(qrBoxSize + 40, 260) }}
            role="img"
            aria-label="QR code scanner viewport"
          ></div>
          <div className="absolute inset-0 pointer-events-none border-[28px] sm:border-[40px] border-black/50 z-10"></div>
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-accent z-20 animate-pulse rounded-lg"
            style={{ width: qrBoxSize, height: qrBoxSize }}
          ></div>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/60 px-3 py-1.5 rounded-full">
            Align the QR inside the frame
          </p>
        </div>
      )}

      {!scannerActive && showResult && (
        <Card className="p-8 bg-white/90 border border-slate-200 rounded-xl flex flex-col items-center text-center shadow-lg" role="status">
          {status === "processing" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">Recording attendance…</p>
              <p className="text-sm text-muted-foreground">
                Hold tight while we validate your QR code.
              </p>
            </div>
          )}
          {status !== "processing" && (
            <>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${status === "success" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                {status === "success" ? (
                  <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
                ) : (
                  <AlertCircle className="w-8 h-8" aria-hidden="true" />
                )}
              </div>
              <h3 className="text-xl font-heading font-bold text-foreground mb-2">
                {status === "success" ? "Scan recorded!" : "Scan failed"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">{resultMessage}</p>
              <Button
                onClick={() => {
                  setResultMessage(null);
                  setStatus("idle");
                  setScannerActive(true);
                }}
                variant={status === "success" ? "default" : "secondary"}
              >
                Scan again
              </Button>
            </>
          )}
        </Card>
      )}

      {scannerActive && status === "idle" && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          Position the QR code within the frame to check in. Keyboard users can press space or enter on the start button to activate the scanner.
        </p>
      )}

      {error && !scannerActive && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
