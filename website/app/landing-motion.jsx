'use client';

import { useEffect } from 'react';

export default function LandingMotion() {
  useEffect(() => {
    let cleanup;
    let active = true;
    Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('./landing-interactions'),
    ]).then(([gsapModule, triggerModule, interactions]) => {
      if (active) cleanup = interactions.initLanding(gsapModule.gsap, triggerModule.ScrollTrigger);
    });
    return () => {
      active = false;
      cleanup?.();
    };
  }, []);
  return null;
}
