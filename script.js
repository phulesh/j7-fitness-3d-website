(() => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const header = document.getElementById('siteHeader');
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.getElementById('navLinks');
  const progressBarRoot = document.documentElement;

  const setLoaded = () => {
    window.setTimeout(() => document.body.classList.add('loaded'), 450);
  };

  if (document.readyState === 'complete') {
    setLoaded();
  } else {
    window.addEventListener('load', setLoaded, { once: true });
  }

  // Mobile navigation
  const closeMenu = () => {
    header?.classList.remove('menu-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  };

  navToggle?.addEventListener('click', () => {
    const isOpen = header.classList.toggle('menu-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks?.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  // Sticky header + scroll progress
  const updateScrollUI = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBarRoot.style.setProperty('--scroll-progress', `${Math.min(100, Math.max(0, progress)).toFixed(2)}%`);
    header?.classList.toggle('is-scrolled', scrollTop > 14);
  };

  updateScrollUI();
  window.addEventListener('scroll', updateScrollUI, { passive: true });
  window.addEventListener('resize', updateScrollUI);

  // Stagger reveal groups for a more premium cadence.
  const staggerGroups = [
    '.services-grid .reveal',
    '.trainer-cards .reveal',
    '.why-grid .reveal',
    '.review-cards .reveal',
    '.equipment-track .reveal'
  ];

  staggerGroups.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      const step = selector.includes('services-grid') ? 0.045 : 0.07;
      element.style.setProperty('--delay', `${(index % 6) * step}s`);
    });
  });

  // Scroll reveal
  const revealElements = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !prefersReduced) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add('is-visible'));
  }

  // Active nav link tracking
  const navAnchors = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navAnchors
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window) {
    const activeObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        navAnchors.forEach((link) => link.classList.toggle('is-active', link.getAttribute('href') === id));
      });
    }, { threshold: 0.42, rootMargin: '-20% 0px -55% 0px' });

    sections.forEach((section) => activeObserver.observe(section));
  }

  // Animated counters
  const counters = [...document.querySelectorAll('.counter')];

  const formatCounter = (value, decimals) => {
    if (decimals > 0) return value.toFixed(decimals);
    return Math.round(value).toLocaleString('en-IN');
  };

  const animateCounter = (element) => {
    if (element.dataset.counted === 'true') return;
    element.dataset.counted = 'true';

    const target = Number.parseFloat(element.dataset.target || '0');
    const decimals = Number.parseInt(element.dataset.decimals || '0', 10);
    const prefix = element.dataset.prefix || '';
    const suffix = element.dataset.suffix || '';
    const duration = prefersReduced ? 1 : 1450 + Math.min(700, target * 2);
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = target * eased;
      element.textContent = `${prefix}${formatCounter(current, decimals)}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        element.textContent = `${prefix}${formatCounter(target, decimals)}${suffix}`;
      }
    };

    requestAnimationFrame(tick);
  };

  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.55 });

    counters.forEach((counter) => counterObserver.observe(counter));
  } else {
    counters.forEach(animateCounter);
  }

  // 3D tilt interactions
  if (finePointer && !prefersReduced) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      const maxTilt = card.classList.contains('scene-stage') ? 5 : 8;

      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        const tiltY = (x - 0.5) * maxTilt * 2;
        const tiltX = -(y - 0.5) * maxTilt * 2;

        card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
        card.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
        card.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
      });

      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
        card.style.setProperty('--glare-x', '50%');
        card.style.setProperty('--glare-y', '50%');
      });
    });

    document.querySelectorAll('.btn').forEach((button) => {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        button.style.setProperty('--glare-x', `${x.toFixed(1)}%`);
        button.style.setProperty('--glare-y', `${y.toFixed(1)}%`);
      });
    });
  }

  // Pointer parallax for the hero floating objects.
  const parallaxLayers = [...document.querySelectorAll('.floating-layer')];
  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let parallaxQueued = false;

  const updateParallax = () => {
    const normalX = pointerX / window.innerWidth - 0.5;
    const normalY = pointerY / window.innerHeight - 0.5;

    parallaxLayers.forEach((layer) => {
      const depth = Number.parseFloat(layer.dataset.depth || '10');
      layer.style.setProperty('--parallax-x', `${(normalX * depth).toFixed(2)}px`);
      layer.style.setProperty('--parallax-y', `${(normalY * depth).toFixed(2)}px`);
    });

    parallaxQueued = false;
  };

  if (finePointer && !prefersReduced) {
    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!parallaxQueued) {
        parallaxQueued = true;
        requestAnimationFrame(updateParallax);
      }
    }, { passive: true });
  }

  // Frontend-only demo toast interactions
  const toast = document.querySelector('.demo-toast');
  const toastText = toast?.querySelector('span');
  let toastTimer;

  const showToast = (message) => {
    if (!toast || !toastText) return;
    toastText.textContent = `${message} · Frontend demo only`;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-demo-action]');
    if (!trigger) return;

    const href = trigger.getAttribute('href');
    if (href) event.preventDefault();

    showToast(trigger.dataset.demoAction || 'Demo interaction');

    if (href?.startsWith('#')) {
      document.querySelector(href)?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    }
  });

  // Particle field — light and adaptive for mobile performance.
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas?.getContext('2d', { alpha: true });
  let particles = [];
  let particleFrame;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

  const random = (min, max) => Math.random() * (max - min) + min;

  const createParticle = (width, height) => ({
    x: random(0, width),
    y: random(0, height),
    vx: random(-0.16, 0.16),
    vy: random(-0.12, 0.12),
    radius: random(0.65, 1.9),
    alpha: random(0.18, 0.62),
    hue: Math.random() > 0.76 ? '185, 255, 74' : '34, 244, 255'
  });

  const resizeParticles = () => {
    if (!canvas || !ctx) return;

    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round(Math.min(width < 700 ? 42 : 78, Math.max(34, width / 18)));
    particles = Array.from({ length: count }, () => createParticle(width, height));
  };

  const drawParticles = () => {
    if (!canvas || !ctx) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.clearRect(0, 0, width, height);

    particles.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;

      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 7);
      glow.addColorStop(0, `rgba(${p.hue}, ${p.alpha})`);
      glow.addColorStop(1, `rgba(${p.hue}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 7, 0, Math.PI * 2);
      ctx.fill();

      for (let j = i + 1; j < particles.length; j += 1) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 118) {
          ctx.globalAlpha = (1 - dist / 118) * 0.13;
          ctx.strokeStyle = `rgba(34, 244, 255, 1)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    });

    particleFrame = requestAnimationFrame(drawParticles);
  };

  if (canvas && ctx && !prefersReduced) {
    resizeParticles();
    drawParticles();

    let resizeTimer;
    window.addEventListener('resize', () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        cancelAnimationFrame(particleFrame);
        resizeParticles();
        drawParticles();
      }, 180);
    });
  }
})();
