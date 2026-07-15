"use client";

import React, { useEffect, useRef } from "react";

interface ConfettiProps {
  active: boolean;
  duration?: number;
  onDone?: () => void;
}

const COLORS = [
  "#f59e0b", "#10b981", "#6366f1", "#ec4899", "#f97316",
  "#14b8a6", "#8b5cf6", "#ef4444", "#84cc16", "#0ea5e9",
];

export function Confetti({ active, duration = 3500, onDone }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const particlesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Spawn particles
    particlesRef.current = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width,
      y: -10,
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      va: (Math.random() - 0.5) * 0.2,
      gravity: 0.08 + Math.random() * 0.04,
      opacity: 1,
    }));

    const startTime = Date.now();

    const animate = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const elapsed = Date.now() - startTime;
      const fadeStart = duration - 800;

      particlesRef.current.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.angle += p.va;
        if (elapsed > fadeStart) {
          p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / 800);
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < duration) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDone?.();
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, duration, onDone]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[9999] pointer-events-none"
    />
  );
}
