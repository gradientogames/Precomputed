import '../quote.css'
import { navigate } from '../lib/router'
import { hasSupabase } from '../lib/supabaseClient'
import { useEffect, useState, useRef } from 'react'
import { type AuthUser, onAuthChange } from '../lib/auth'

export default function Home() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const quoteAnimated = useRef(false);

  // Function to wrap each character in a span for animation
  const wrapCharsForAnimation = () => {
    if (quoteAnimated.current) return;
    
    // Get all elements that need character animation
    const elements = document.querySelectorAll('.textReveal, .textRevealEmphasised, .textRevealDelay');
    
    elements.forEach(element => {
      const delayClass = element.classList.contains('textRevealDelay') ? ' delay' : '';
      if(element.classList.contains('textRevealEmphasised')){
        const text = element.textContent || '';
        const blockText = `<span class="char-reveal emphasised${delayClass}">${text}</span>` 
        requestAnimationFrame(() => {
          element.innerHTML = blockText;
        });
      } else
      {
        const text = element.textContent || '';
        const wrappedText = Array.from(text).map(char => {
          // Skip wrapping spaces to maintain proper text flow
          if (char === ' ') return ' ';
          return `<span class="char-reveal${delayClass}">${char}</span>`;
        }).join('');

        // Use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
          element.innerHTML = wrappedText;
        });
      }
    });
    
    // Start the animation with a slight delay
    setTimeout(animateChars, 100);
    quoteAnimated.current = true;
  };
  
  // Function to animate each character sequentially
  const animateChars = () => {
    const chars = document.querySelectorAll('.char-reveal');
    let currentDelay = 0;
    chars.forEach((char) => {
      const isDelayed = char.classList.contains('delay');
      setTimeout(() => {
        char.classList.add('animated');
      }, currentDelay); // 30ms delay between each character
      currentDelay += (isDelayed) ? 1000 : 50;
    });
  };

  useEffect(() => {
    if (!hasSupabase) return;
    const unsub = onAuthChange((u) => {
      setUser(u);
    });
    
    // Initialize the character animation
    wrapCharsForAnimation();
    
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
              <div id="tagline" className="line line1 textReveal">Why learn programming</div>
              <div id="tagline" className="line line2 textReveal">when there is</div>
            </div>
            <div className="top-right">
              <span className="ai-word textRevealEmphasised">AI</span>
              <span className="ai-question textReveal textRevealDelay">?</span>
            </div>
          </div>
          <div className="quote-bottom" aria-label="Bottom section of quote">
            <div className="bottom-line textReveal">AI sucks without a</div>
            <span className="programmer-word textRevealEmphasised">PROGRAMMER</span>
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