export function initLanding(gsap, ScrollTrigger) {
  const listeners = new AbortController();
  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      nav.classList.toggle('is-open', open);
    }, {signal: listeners.signal});
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) {
        menuButton.setAttribute('aria-expanded', 'false');
        menuButton.setAttribute('aria-label', 'Ouvrir le menu');
        nav.classList.remove('is-open');
      }
    }, {signal: listeners.signal});
  }

  const steps = [
    {label: '01 / CATALOGUE PRODUIT', caption: 'Votre équipe reconnaît le produit et retrouve son prix dans une seule fiche.'},
    {label: '02 / TROUVER ET SCANNER', caption: 'Photo, nom ou code-barres : trouvez rapidement le bon article.'},
    {label: '03 / CONFIRMER LA VENTE', caption: 'Vérifiez les quantités et validez le paiement avant de poursuivre.'},
    {label: '04 / STOCK ET INVENTAIRE', caption: 'Les ventes rejoignent le suivi du stock ; contrôlez ensuite les seuils et les réceptions.'}
  ];
  const tabs = [...document.querySelectorAll('.workflow-step')];
  const galleryFigures = [...document.querySelectorAll('.screen-gallery figure')];
  const label = document.querySelector('#screen-label');
  const caption = document.querySelector('#screen-caption');
  const panel = document.querySelector('#workflow-panel');
  function selectStep(index, focus = false) {
    const step = steps[index];
    if (!step || !label || !caption || !panel) return;
    tabs.forEach((tab, i) => {
      const selected = i === index;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panel.classList.toggle('is-stock', index === 3);
    galleryFigures.forEach((figure, i) => figure.classList.toggle('is-current', i === index));
    label.textContent = step.label;
    caption.textContent = step.caption;
    panel.setAttribute('aria-labelledby', tabs[index].id);
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStep(index), {signal: listeners.signal});
    tab.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? (index - 1 + tabs.length) % tabs.length : -1;
      if (next >= 0) { event.preventDefault(); selectStep(next, true); }
    }, {signal: listeners.signal});
  });
  if (tabs.length) selectStep(0);

  gsap.registerPlugin(ScrollTrigger);

  const motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    const hero = gsap.timeline({defaults: {ease: 'power2.out'}});
    hero
      .from('.hero .eyebrow', {y: 16, autoAlpha: 0, duration: .55})
      .from('.hero h1', {y: 38, autoAlpha: 0, duration: .85}, '-=.28')
      .from('.hero-lead', {y: 20, autoAlpha: 0, duration: .65}, '-=.48')
      .from('.hero-actions', {y: 18, autoAlpha: 0, duration: .65}, '-=.4')
      .from('.hero-foot', {y: 12, autoAlpha: 0, duration: .5}, '-=.32')
      .fromTo('.hero-photo img', {scale: 1.13}, {scale: 1.08, duration: 1.8, ease: 'power1.out'}, 0);

    const reveal = [
      '.relief .section-top', '.relief h2', '.relief-card',
      '.setup-copy .eyebrow', '.setup-copy h2', '.setup-copy > p:not(.eyebrow)',
      '.setup-note', '.setup-visual',
      '.workflow .section-top', '.workflow h2', '.workflow-step', '.workflow-panel',
      '.mobile-band-grid > div:first-child', '.phone-gallery',
      '.features .section-top', '.feature-heading', '.feature-start', '.feature',
      '.free-grid > div:first-child', '.free-receipt',
      '.faq-intro', '.faq-list details', '.closing-grid'
    ];
    gsap.utils.toArray(reveal.join(',')).forEach(element => {
      gsap.from(element, {
        y: 24,
        autoAlpha: 0,
        duration: .72,
        ease: 'power2.out',
        clearProps: 'transform,opacity,visibility',
        scrollTrigger: {trigger: element, start: 'top 88%', once: true}
      });
    });

    gsap.from('.promise-strip span', {
      y: 12, autoAlpha: 0, stagger: .08, duration: .5,
      scrollTrigger: {trigger: '.promise-strip', start: 'top 95%', once: true}
    });
    window.addEventListener('load', () => ScrollTrigger.refresh(), {once: true});
  });

  motion.add('(min-width: 701px) and (prefers-reduced-motion: no-preference)', () => {
    gsap.to('.hero-photo img', {
      yPercent: 5, ease: 'none',
      scrollTrigger: {trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1}
    });
    gsap.to('.connection-card', {y: -8, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut'});
    gsap.to('.phone-gallery figure', {y: '-=9', duration: 3.6, stagger: .35, repeat: -1, yoyo: true, ease: 'sine.inOut'});
    gsap.to('.feature-preview', {
      y: -12, ease: 'none',
      scrollTrigger: {trigger: '.features', start: 'top bottom', end: 'bottom top', scrub: 1}
    });
  });
  return () => {
    listeners.abort();
    motion.revert();
  };
}
