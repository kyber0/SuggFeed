"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; size: number; alpha: number; spin: number; spinV: number;
}

const COLORS = ["#e86e4a","#0b3857","#11845b","#f5a623","#4a90d9","#e84a8f","#9b59b6"];

export function Confetti({ trigger }: { trigger: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext("2d")!;

    particles.current = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: Math.random() * 8 + 4,
      alpha: 1,
      spin: Math.random() * Math.PI * 2,
      spinV: (Math.random() - 0.5) * 0.3,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      particles.current = particles.current.filter((p) => p.alpha > 0.02);
      for (const p of particles.current) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12;
        p.spin += p.spinV; p.alpha -= 0.012;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y); ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (particles.current.length > 0) raf.current = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [trigger]);

  return <canvas ref={canvasRef} id="confetti-canvas" aria-hidden="true" />;
}
