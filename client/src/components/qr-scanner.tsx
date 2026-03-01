import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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

function safeClear(scanner: Html5Qrcode) {
  try {
    scanner.clear();
  } catch {
    // Ignore scanner clear errors from browser/runtime differences.
  }
}

export default function QRScanner({ onScan }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingScanRef = useRef(false);
  const resetTimeoutRef = useRef<number | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [qrBoxSize, setQrBoxSize] = useState(260);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const scanBoxSize = Math.floor(qrBoxSize);

  useEffect(() => {
    const updateSize = () => {
      if (typeof window === "undefined") return;
      setIsMobileViewport(window.innerWidth < 768);
      const calculated = Math.min(300, Math.max(180, Math.floor(window.innerWidth * 0.72)));
      setQrBoxSize(calculated);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
      const scanner = scannerRef.current;
      if (!scanner) return;
      if (scanner.getState && scanner.getState() === 2) {
        scanner
          .stop()
          .catch(() => undefined)
          .finally(() => {
            safeClear(scanner);
          });
      } else {
        safeClear(scanner);
      }
    };
  }, []);

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
      const previous = scannerRef.current;
      if (previous) {
        if (previous.getState && previous.getState() === 2) {
          await previous
            .stop()
            .catch(() => undefined)
            .finally(() => {
              safeClear(previous);
            });
        } else {
          safeClear(previous);
        }
      }

      setScannerActive(true);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

      const readerElement = document.getElementById("reader");
      if (!readerElement) {
        throw new Error("Scanner viewport failed to mount. Please try again.");
      }

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      let cameraConfig: { deviceId: { exact: string } } | { facingMode: string } = {
        facingMode: "environment",
      };
      try {
        const cameras = await Html5Qrcode.getCameras();
        const backCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
        if (backCamera) {
          cameraConfig = { deviceId: { exact: backCamera.id } };
        }
      } catch {
        cameraConfig = { facingMode: "environment" };
      }

      const scannerConfig = {
        fps: isMobileViewport ? 12 : 16,
        qrbox: { width: scanBoxSize, height: scanBoxSize },
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        disableFlip: false,
        rememberLastUsedCamera: true,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        videoConstraints: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      } as const;

      const onSuccess = async (decodedText: string) => {
          if (processingScanRef.current) return;
          processingScanRef.current = true;
          setProcessingScan(true);
          setStatus("processing");

          try {
            await scanner.pause(true);
          } catch {
            // Ignore pause failures for older html5-qrcode versions.
          }

          try {
            const result = await onScan(decodedText);
            setResultMessage(result?.message ?? "Attendance recorded successfully.");
            if (result?.success === false) {
              setStatus("error");
              try {
                await scanner.resume();
              } catch {
                // Ignore resume failures for older html5-qrcode versions.
              }
              if (resetTimeoutRef.current !== null) {
                window.clearTimeout(resetTimeoutRef.current);
              }
              resetTimeoutRef.current = window.setTimeout(() => {
                setStatus("idle");
                setResultMessage(null);
              }, 2500);
            } else {
              setStatus("success");
              if (scanner.getState && scanner.getState() === 2) {
                await scanner
                  .stop()
                  .catch(() => undefined)
                  .finally(() => {
                    safeClear(scanner);
                  });
              } else {
                safeClear(scanner);
              }
              setScannerActive(false);
            }
          } catch (err) {
            setResultMessage(err instanceof Error ? err.message : "Could not record attendance.");
            setStatus("error");
            try {
              await scanner.resume();
            } catch {
              // Ignore resume failures for older html5-qrcode versions.
            }
            if (resetTimeoutRef.current !== null) {
              window.clearTimeout(resetTimeoutRef.current);
            }
            resetTimeoutRef.current = window.setTimeout(() => {
              setStatus("idle");
              setResultMessage(null);
            }, 2500);
          } finally {
            processingScanRef.current = false;
            setProcessingScan(false);
          }
      };

      try {
        await scanner.start(
          cameraConfig,
          scannerConfig,
          onSuccess,
          () => undefined,
        );
      } catch {
        await scanner.start(
          { facingMode: "environment" },
          scannerConfig,
          onSuccess,
          () => undefined,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : typeof err === "string" && err
            ? err
            : "Could not start the camera. Please try again.";
      setError(message);
      setScannerActive(false);
      const scanner = scannerRef.current;
      if (scanner) {
        safeClear(scanner);
      }
    } finally {
      setRequestingPermission(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4" aria-live="polite">
      {!scannerActive && !showResult && (
        <Card className="p-5 sm:p-6 bg-card/95 border border-border shadow-xl rounded-2xl text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">Allow camera access</p>
          <p className="text-sm text-muted-foreground">
            We need your camera to scan the QR code displayed by your professor.
          </p>
          <Button variant="secondary" onClick={requestCamera} disabled={requestingPermission}>
            {requestingPermission ? "Opening camera..." : "Open camera & start scanning"}
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
          />
          <div className="absolute inset-0 pointer-events-none border-[24px] sm:border-[36px] border-black/50 z-10" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-accent z-20 animate-pulse rounded-lg"
            style={{ width: scanBoxSize, height: scanBoxSize }}
          />
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/60 px-3 py-1.5 rounded-full">
            Align the QR inside the frame
          </p>
        </div>
      )}

      {!scannerActive && showResult && (
        <Card
          className="p-6 sm:p-8 bg-card/95 border border-border rounded-xl flex flex-col items-center text-center shadow-lg"
          role="status"
        >
          {status === "processing" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-base font-semibold text-foreground">Recording attendance...</p>
              <p className="text-sm text-muted-foreground">Hold tight while we validate your QR code.</p>
            </div>
          )}
          {status !== "processing" && (
            <>
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                  status === "success" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                }`}
              >
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
                  void requestCamera();
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
        <p className="text-center text-sm text-muted-foreground mt-4 px-2">
          Position the QR code within the frame to check in.
        </p>
      )}

      {scannerActive && status === "error" && resultMessage && (
        <p className="text-center text-sm text-destructive mt-4 px-2">
          {resultMessage}
        </p>
      )}

      {error && !scannerActive && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
