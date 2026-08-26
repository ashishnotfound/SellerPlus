"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, LoaderCircle } from "lucide-react";

interface BarcodeDetectorResult {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
    webkitAudioContext?: typeof AudioContext;
  }
}

interface BarcodeScannerProps {
  active: boolean;
  disabled?: boolean;
  onDetected: (barcode: string) => void;
  onError: (message: string) => void;
}

export function BarcodeScanner({ active, disabled = false, onDetected, onError }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onErrorRef = useRef(onError);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let inFlight = false;
    let lastFrame = 0;

    const stop = () => {
      stopped = true;
      if (frame) window.cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setRunning(false);
      setStarting(false);
    };

    if (!active || disabled) {
      stop();
      return stop;
    }

    const start = async () => {
      setStarting(true);
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current("This browser cannot access a camera. Use a hardware scanner or manual AWB entry.");
        setStarting(false);
        return;
      }
      if (!window.BarcodeDetector) {
        onErrorRef.current("Camera barcode detection is unavailable on this browser. Use Android Chrome, a hardware scanner, or manual AWB entry.");
        setStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable.");
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "itf"] });
        setStarting(false);
        setRunning(true);

        const scan = async (timestamp: number) => {
          if (stopped) return;
          frame = window.requestAnimationFrame(scan);
          if (inFlight || timestamp - lastFrame < 120 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          lastFrame = timestamp;
          inFlight = true;
          try {
            const results = await detector.detect(video);
            const value = results.find((result) => result.rawValue?.trim())?.rawValue?.trim();
            if (value && !stopped) onDetectedRef.current(value);
          } catch {
            // A frame can be undecodable while the camera is moving; keep scanning.
          } finally {
            inFlight = false;
          }
        };
        frame = window.requestAnimationFrame(scan);
      } catch (error) {
        stop();
        const name = error instanceof DOMException ? error.name : "";
        onErrorRef.current(name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in Android Chrome, then try again."
          : "The camera could not start. Use a hardware scanner or manual AWB entry.");
      }
    };
    void start();
    return stop;
  }, [active, disabled]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black min-h-[220px]">
      <video ref={videoRef} muted playsInline className="h-full min-h-[220px] w-full object-cover" aria-label="Barcode camera preview" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-20 w-[82%] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/65 px-3 py-2 text-[11px] text-zinc-300">
        <span className="flex items-center gap-1.5">
          {starting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : running ? <Camera className="h-3.5 w-3.5 text-emerald-400" /> : <CameraOff className="h-3.5 w-3.5 text-amber-400" />}
          {starting ? "Starting camera…" : running ? "Point at the long AWB barcode" : "Camera ready when you start scanning"}
        </span>
        <span className="text-zinc-500">Android Chrome</span>
      </div>
    </div>
  );
}
