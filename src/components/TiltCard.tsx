import React, { useEffect, useRef, useState, ReactNode } from 'react';

interface TiltCardProps {
  children: ReactNode;
  className?: string; // optional additional class names
}

const TiltCard: React.FC<TiltCardProps> = ({ children, className = '' }) => {
  const MAX_ROT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tiltcard-max-rot')) || 18;
  const EASE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tiltcard-ease-speed')) || 0.12;
  const GLARE_SENSITIVITY = 1;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const [target, setTarget] = useState({ rx: 0, ry: 0, tz: 0, gx: 50, gy: 0, go: 0.6 });
  const [curr, setCurr] = useState({ rx: 0, ry: 0, tz: 0, gx: 50, gy: 0, go: 0.6 });

  useEffect(() => {
    const updateRect = () => {
      if (wrapperRef.current) setRect(wrapperRef.current.getBoundingClientRect());
    };

    const move = (x: number, y: number) => {
      if (!rect) return;
      const nx = (x - rect.left) / rect.width;
      const ny = (y - rect.top) / rect.height;
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      setPointer({ x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) });
      setTarget({
        rx: -dy * MAX_ROT,
        ry: dx * MAX_ROT,
        tz: 30 - dist * 22,
        gx: nx * 100 + 10,
        gy: ny * 100 - 20,
        go: 0.25 + (1 - dist) * GLARE_SENSITIVITY * 0.6,
      });
    };

    const enter = () => {
      if (cardRef.current) cardRef.current.style.transition = 'box-shadow 0.25s ease';
    };

    const leave = () => {
      setTarget({ rx: 0, ry: 0, tz: 18, gx: 50, gy: 0, go: 0.55 });
      if (cardRef.current) cardRef.current.style.transition = 'box-shadow 0.3s ease';
    };

    const animate = () => {
      if (!cardRef.current || !glareRef.current) return;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      setCurr(prev => ({
        rx: lerp(prev.rx, target.rx, EASE),
        ry: lerp(prev.ry, target.ry, EASE),
        tz: lerp(prev.tz, target.tz, EASE),
        gx: lerp(prev.gx, target.gx, EASE),
        gy: lerp(prev.gy, target.gy, EASE),
        go: lerp(prev.go, target.go, EASE),
      }));

      const t = `rotateX(${curr.rx}deg) rotateY(${curr.ry}deg) translateZ(${curr.tz}px)`;
      cardRef.current.style.transform = t;
      glareRef.current.style.left = (curr.gx - 2) + '%';
      glareRef.current.style.top = (curr.gy * 1.3) + '%';
      glareRef.current.style.opacity = curr.go;

      const absRot = Math.max(Math.abs(curr.rx), Math.abs(curr.ry));
      cardRef.current.style.boxShadow = `0 ${18 + absRot * 0.8}px ${30 + absRot * 1.8}px rgba(2,6,23,0.55)`;

      requestAnimationFrame(animate);
    };

    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };

    updateRect();
    animate();

    window.addEventListener('resize', updateRect);
    wrapperRef.current?.addEventListener('mousemove', onMouseMove);
    wrapperRef.current?.addEventListener('mouseenter', enter);
    wrapperRef.current?.addEventListener('mouseleave', leave);
    wrapperRef.current?.addEventListener('touchmove', onTouchMove, { passive: true });
    wrapperRef.current?.addEventListener('touchstart', enter, { passive: true });
    wrapperRef.current?.addEventListener('touchend', leave, { passive: true });

    return () => {
      window.removeEventListener('resize', updateRect);
      wrapperRef.current?.removeEventListener('mousemove', onMouseMove);
      wrapperRef.current?.removeEventListener('mouseenter', enter);
      wrapperRef.current?.removeEventListener('mouseleave', leave);
      wrapperRef.current?.removeEventListener('touchmove', onTouchMove);
      wrapperRef.current?.removeEventListener('touchstart', enter);
      wrapperRef.current?.removeEventListener('touchend', leave);
    };
  }, [rect, curr, target]);

  return (
    <div className={`card-3d ${className}`} ref={wrapperRef}>
      <div className="card-inner" ref={cardRef}>
        <div className="glare" ref={glareRef}></div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
};

export default TiltCard;
