import '../quote.css'
import { navigate } from '../lib/router'
import { hasSupabase } from '../lib/supabaseClient'
import { useEffect, useState } from 'react'
import { type AuthUser, onAuthChange } from '../lib/auth'

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (!hasSupabase) return;
    const unsub = onAuthChange((u) => {
      setUser(u);
    });
    return () => {
      try {
        unsub && (unsub as any)();
      } catch {}
    };
  }, []);

  const handleStartLearning = () => {
    if (hasSupabase && !user) {
      navigate('signin' as any);
    } else {
      navigate('languages' as any);
    }
  };

  return (
    <div>
      <section className="quote-layout">
        <div className="quote-inner">
          <div className="quote-top" aria-label="Top section of quote">
            <div className="top-left">
              <div id="tagline" className="line line1">Why learn programming</div>
              <div id="tagline" className="line line2">when there is</div>
            </div>
            <div className="top-right">
              <span className="ai-word">AI</span>
              <span className="ai-question">?</span>
            </div>
          </div>
          <div className="quote-bottom" aria-label="Bottom section of quote">
            <div className="bottom-line">AI sucks without a</div>
            <div className="bottom-line">
              <span className="programmer-word">PROGRAMMER</span>
              <span className="period">.</span>
            </div>
          </div>
        </div>
      </section>

      <div className="hero-section">
        <h1 className="hero-text">PRECOMPUTED</h1>
        <p className="hero-subtitle">Start learning now for free. No catch!</p>
        <button 
          className="btn btn-primary btn-large" 
          onClick={handleStartLearning}
        >
          Start Learning
        </button>
      </div>
      <div className="space-4"></div>
    </div>
  )
}