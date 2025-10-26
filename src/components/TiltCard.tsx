import React, {ReactNode, useEffect, useRef, useState, useCallback} from 'react';

interface TiltCardProps {
  children: ReactNode;
  className?: string; // optional additional class names
}

const TiltCard: React.FC<TiltCardProps> = ({children, className = ''}) => {
  // Use memoized values to avoid recalculating on every render
  const MAX_ROT = useRef(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tiltcard-max-rot')) || 18).current;
  const EASE = useRef(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tiltcard-ease-speed')) || 0.12).current;
  const GLARE_SENSITIVITY = useRef(1).current;

  
  // Throttle mouse movement for better performance
  const THROTTLE_MS = 16; // ~60fps

  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pointer, setPointer] = useState({x: 0.5, y: 0.5});
  const [target, setTarget] = useState({rx: 0, ry: 0, tz: 0, gx: 50, gy: 0, go: 0.6});
  const [curr, setCurr] = useState({rx: 0, ry: 0, tz: 0, gx: 50, gy: 0, go: 0.6});

  // Animation frame reference for cleanup
  const animationFrameRef = useRef<number | null>(null);

  // Update rect when component mounts, window resizes, or page scrolls
  useEffect(() => {
    const updateRect = () => {
      if (wrapperRef.current) setRect(wrapperRef.current.getBoundingClientRect());
    };
    
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, { passive: true });
    
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect);
    };
  }, []);

  // Memoize the lerp function to avoid recreating it on each render
  const lerp = useCallback((a: number, b: number, t: number) => a + (b - a) * t, []);
  
  // Handle animation separately with optimized animation frame handling
  useEffect(() => {
    // Skip animation if difference is negligible
    const isSignificantChange = 
      Math.abs(curr.rx - target.rx) > 0.01 || 
      Math.abs(curr.ry - target.ry) > 0.01;
    
    const animate = () => {
      if (!cardRef.current || !glareRef.current) return;
      
      // Calculate new values
      const newCurr = {
        rx: lerp(curr.rx, target.rx, EASE),
        ry: lerp(curr.ry, target.ry, EASE),
        tz: lerp(curr.tz, target.tz, EASE),
        gx: lerp(curr.gx, target.gx, EASE),
        gy: lerp(curr.gy, target.gy, EASE),
        go: lerp(curr.go, target.go, EASE),
      };
      
      // Only update state if there's a meaningful change
      if (
        Math.abs(newCurr.rx - curr.rx) > 0.01 || 
        Math.abs(newCurr.ry - curr.ry) > 0.01 ||
        Math.abs(newCurr.tz - curr.tz) > 0.1
      ) {
        setCurr(newCurr);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Only start animation if there's a significant change to animate
    if (isSignificantChange) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [target, curr, EASE, lerp]); // Include curr to detect changes

  // Apply styles based on current values
  useEffect(() => {
    if (!cardRef.current || !glareRef.current) return;
    
    const t = `rotateX(${curr.rx}deg) rotateY(${curr.ry}deg) translateZ(${curr.tz}px)`;
    cardRef.current.style.transform = t;
    glareRef.current.style.left = (curr.gx - 2) + '%';
    glareRef.current.style.top = (curr.gy * 1.3) + '%';
    glareRef.current.style.opacity = curr.go.toString();

    const absRot = Math.max(Math.abs(curr.rx), Math.abs(curr.ry));
    cardRef.current.style.boxShadow = `0 ${18 + absRot * 0.8}px ${30 + absRot * 1.8}px rgba(2,6,23,0.55)`;
  }, [curr]);

  // Create throttled move function
  const lastMoveTime = useRef(0);
  
  // Handle mouse and touch events
  useEffect(() => {
    if (!wrapperRef.current) return;
    
    const move = (x: number, y: number) => {
      if (!rect) return;
      
      // Throttle movement updates
      const now = performance.now();
      if (now - lastMoveTime.current < THROTTLE_MS) return;
      lastMoveTime.current = now;
      
      // Calculate mouse position relative to the card
      const cardX = x - rect.left;
      const cardY = y - rect.top;
      
      // Calculate normalized position (0-1) within the card
      const nx = Math.max(0, Math.min(1, cardX / rect.width));
      const ny = Math.max(0, Math.min(1, cardY / rect.height));
      
      // Calculate direction vectors (-1 to 1)
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      setPointer({x: nx, y: ny});
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
      setTarget({rx: 0, ry: 0, tz: 18, gx: 50, gy: 0, go: 0.55});
      if (cardRef.current) cardRef.current.style.transition = 'box-shadow 0.3s ease';
    };

    // Use passive event listeners for better performance
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY);
    };

    wrapperRef.current.addEventListener('mousemove', onMouseMove, {passive: true});
    wrapperRef.current.addEventListener('mouseenter', enter, {passive: true});
    wrapperRef.current.addEventListener('mouseleave', leave, {passive: true});
    wrapperRef.current.addEventListener('touchmove', onTouchMove, {passive: true});
    wrapperRef.current.addEventListener('touchstart', enter, {passive: true});
    wrapperRef.current.addEventListener('touchend', leave, {passive: true});

    return () => {
      if (!wrapperRef.current) return;
      wrapperRef.current.removeEventListener('mousemove', onMouseMove);
      wrapperRef.current.removeEventListener('mouseenter', enter);
      wrapperRef.current.removeEventListener('mouseleave', leave);
      wrapperRef.current.removeEventListener('touchmove', onTouchMove);
      wrapperRef.current.removeEventListener('touchstart', enter);
      wrapperRef.current.removeEventListener('touchend', leave);
    };
  }, [rect, MAX_ROT, GLARE_SENSITIVITY, THROTTLE_MS]);

  return (
    <div className={`card-3d ${className}`} ref={wrapperRef}>
      <div className="card-3d-inner" ref={cardRef}>
        <div className="card-3d-glare" ref={glareRef}></div>
        <div className="card-3d-contents">{children}</div>
      </div>
    </div>
  );
};

export default TiltCard;
