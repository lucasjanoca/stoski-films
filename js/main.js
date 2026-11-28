'use strict';

let WHATSAPP_NUMBER = '5515997411289';
let INSTAGRAM_URL = 'https://www.instagram.com/stoski_films/';
let WHATSAPP_GREETING = 'Olá, Henrique! Vim pelo site da *Stoski Films* e gostaria de solicitar um orçamento. 🎬';

let PROJECTS = {
  '1': {
    title: 'Histórias a dois',
    category: 'Filme de casamento',
    subtitle: 'Casamentos · Love stories',
    image: 'assets/media/hero-casamento.webp',
    video: '',
    story: 'Um filme pensado para guardar a atmosfera, os detalhes e a emoção de uma celebração a dois. A narrativa transforma cada instante em uma história para reviver.'
  },
  '2': {
    title: 'Presença',
    category: 'Eventos',
    subtitle: 'Eventos · Celebrações',
    image: 'assets/media/evento.webp',
    video: '',
    story: 'Cobertura em vídeo para registrar energia, movimento e os detalhes que fazem um evento ter personalidade, com uma edição construída para manter a experiência viva.'
  },
  '3': {
    title: 'Movimento',
    category: 'Reels & comercial',
    subtitle: 'Marcas · Conteúdo vertical',
    image: 'assets/logo-mark.svg',
    video: '',
    story: 'Vídeos curtos e produções comerciais com ritmo, linguagem visual e acabamento para comunicar uma ideia com impacto.'
  }
};

const qs = (selector, scope = document) => scope?.querySelector(selector) || null;
const qsa = (selector, scope = document) => [...scope.querySelectorAll(selector)];


function applyRuntimeConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  if (cfg.social?.whatsappNumber) WHATSAPP_NUMBER = String(cfg.social.whatsappNumber).replace(/\D/g, '');
  if (cfg.social?.instagramUrl) INSTAGRAM_URL = String(cfg.social.instagramUrl);
  if (cfg.budget?.whatsappGreeting) WHATSAPP_GREETING = String(cfg.budget.whatsappGreeting);
  if (Array.isArray(cfg.portfolio?.items)) {
    PROJECTS = Object.fromEntries(cfg.portfolio.items.map((item, index) => {
      const id = String(item.id || index + 1);
      return [id, {
        title: item.title || '',
        category: item.category || '',
        subtitle: item.subtitle || '',
        image: item.image || 'assets/logo-mark.svg',
        video: item.video || '',
        story: item.story || ''
      }];
    }));
  }

  if (cfg.showreel) {
    PROJECTS.showreel = {
      title: cfg.showreel.title || 'Showreel Stoski Films',
      category: cfg.showreel.kicker || 'Showreel',
      subtitle: '',
      image: cfg.showreel.cover || 'assets/media/hero-casamento.webp',
      video: cfg.showreel.video || '',
      story: cfg.showreel.text || ''
    };
  }
  qsa('a[href*="instagram.com"]').forEach(link => { link.href = INSTAGRAM_URL; });
}

document.addEventListener('stoski:config', event => applyRuntimeConfig(event.detail));
if (window.STOSKI_CONFIG) applyRuntimeConfig(window.STOSKI_CONFIG);

const header = qs('.site-header');
const menuToggle = qs('.menu-toggle');
const nav = qs('.main-nav');
const menuBackdrop = qs('.menu-backdrop');
const form = qs('#budget-form');
const status = qs('#form-status');
const dateInput = qs('#date');
const storyModal = qs('#story-modal');
const videoModal = qs('#video-modal');
const portfolioVideo = qs('#portfolio-video');
const portfolioVideoEmbed = qs('#portfolio-video-embed');
const videoLoading = qs('#video-loading');
const progress = qs('#scroll-progress');
let menuScrollY = 0;
let lastStoryTrigger = null;

const year = qs('#year');
if (year) year.textContent = new Date().getFullYear();

/* Swipeable featured films: only one 16:9 card is visible at any time. */
const showreelViewport = qs('#showreel-viewport');
const showreelDots = qsa('.showreel-dot');
let showreelIndex = 0;

function setActiveShowreelDot(index) {
  showreelIndex = Math.max(0, Math.min(showreelDots.length - 1, index));
  showreelDots.forEach((dot, i) => {
    const active = i === showreelIndex;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-current', String(active));
  });
}

function goToShowreel(index, smooth = true) {
  if (!showreelViewport || !showreelDots.length) return;
  const target = Math.max(0, Math.min(showreelDots.length - 1, index));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  showreelViewport.scrollTo({
    left: target * showreelViewport.clientWidth,
    behavior: smooth && !reduceMotion ? 'smooth' : 'auto'
  });
  setActiveShowreelDot(target);
}

showreelDots.forEach(dot => {
  dot.addEventListener('click', () => goToShowreel(Number(dot.dataset.showreelIndex)));
});

if (showreelViewport) {
  let pendingScrollFrame = false;
  showreelViewport.addEventListener('scroll', () => {
    if (pendingScrollFrame) return;
    pendingScrollFrame = true;
    requestAnimationFrame(() => {
      pendingScrollFrame = false;
      const width = showreelViewport.clientWidth || 1;
      setActiveShowreelDot(Math.round(showreelViewport.scrollLeft / width));
    });
  }, { passive: true });

  showreelViewport.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    goToShowreel(showreelIndex + (event.key === 'ArrowRight' ? 1 : -1));
  });

  // Desktop: arrastar o carrossel com mouse ou caneta, como o swipe no celular.
  // O toque continua usando a rolagem nativa (scroll-snap).
  let activeDragPointer = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let didDrag = false;
  let suppressDragClick = false;

  showreelViewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    activeDragPointer = event.pointerId;
    dragStartX = event.clientX;
    dragStartScroll = showreelViewport.scrollLeft;
    didDrag = false;
    suppressDragClick = false;
  });

  showreelViewport.addEventListener('pointermove', event => {
    if (event.pointerId !== activeDragPointer) return;
    const distance = event.clientX - dragStartX;
    if (!didDrag && Math.abs(distance) < 8) return;
    if (!didDrag) {
      didDrag = true;
      showreelViewport.classList.add('is-dragging');
      showreelViewport.style.scrollSnapType = 'none';
      showreelViewport.setPointerCapture(event.pointerId);
    }
    showreelViewport.scrollLeft = dragStartScroll - distance;
    event.preventDefault();
  });

  const finishShowreelDrag = event => {
    if (event.pointerId !== activeDragPointer) return;
    activeDragPointer = null;
    if (!didDrag) return;
    didDrag = false;
    suppressDragClick = true;
    showreelViewport.classList.remove('is-dragging');
    showreelViewport.style.scrollSnapType = '';
    if (showreelViewport.hasPointerCapture(event.pointerId)) {
      showreelViewport.releasePointerCapture(event.pointerId);
    }
    const width = showreelViewport.clientWidth || 1;
    goToShowreel(Math.round(showreelViewport.scrollLeft / width));
  };

  showreelViewport.addEventListener('pointerup', finishShowreelDrag);
  showreelViewport.addEventListener('pointercancel', finishShowreelDrag);
  showreelViewport.addEventListener('lostpointercapture', finishShowreelDrag);
  showreelViewport.addEventListener('dragstart', event => event.preventDefault());
  // Um gesto de arrastar não deve abrir o vídeo acidentalmente.
  showreelViewport.addEventListener('click', event => {
    if (!suppressDragClick) return;
    suppressDragClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', () => goToShowreel(showreelIndex, false), { passive: true });
}

if (dateInput) {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  dateInput.min = today.toISOString().slice(0, 10);
}

function setMenu(open) {
  if (!menuToggle || !nav) return;
  if (open) {
    menuScrollY = window.scrollY;
    document.body.style.top = `-${menuScrollY}px`;
    document.body.classList.add('menu-open');
  } else if (document.body.classList.contains('menu-open')) {
    document.body.classList.remove('menu-open');
    document.body.style.top = '';
    window.scrollTo(0, menuScrollY);
  }
  nav.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  menuBackdrop?.setAttribute('tabindex', open ? '0' : '-1');
}

menuToggle?.addEventListener('click', () => setMenu(!nav?.classList.contains('open')));
menuBackdrop?.addEventListener('click', () => setMenu(false));
qsa('.main-nav a').forEach(link => link.addEventListener('click', () => setMenu(false)));

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  setMenu(false);
  if (storyModal?.open) storyModal.close();
  if (videoModal?.open) videoModal.close();
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 900 && nav?.classList.contains('open')) setMenu(false);
}, { passive: true });

function updateViewportEffects() {
  header?.classList.toggle('scrolled', window.scrollY > 24);
  if (!progress) return;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  progress.style.width = Math.min(100, Math.max(0, (window.scrollY / max) * 100)) + '%';
}
updateViewportEffects();
window.addEventListener('scroll', updateViewportEffects, { passive: true });
window.addEventListener('resize', updateViewportEffects, { passive: true });

const revealEls = qsa('.reveal');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -24px' });
  revealEls.forEach(el => observer.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('visible'));
}

const navLinks = qsa('.main-nav a[href^="#"]');
if ('IntersectionObserver' in window) {
  const sections = navLinks
    .map(link => qs(link.getAttribute('href')))
    .filter(section => section?.id);
  const navObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const activeId = '#' + visible.target.id;
    navLinks.forEach(link => link.toggleAttribute('aria-current', link.getAttribute('href') === activeId));
  }, { threshold: [0.18,0.35,0.6], rootMargin: '-20% 0px -62% 0px' });
  sections.forEach(section => navObserver.observe(section));
}

qsa('.faq-list details').forEach(item => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    qsa('.faq-list details').forEach(other => { if (other !== item) other.open = false; });
  });
});

document.addEventListener('toggle', event => {
  const item = event.target;
  if (!(item instanceof HTMLDetailsElement) || !item.matches('.faq-list details') || !item.open) return;
  qsa('.faq-list details').forEach(other => { if (other !== item) other.open = false; });
}, true);

function safeMediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function isYouTubeHost(host) {
  return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
}

function isVimeoHost(host) {
  return host === 'vimeo.com' || host.endsWith('.vimeo.com');
}

function youtubeEmbedUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!isYouTubeHost(host)) return '';

    let id = '';
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      const parts = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1] || id;
    }

    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return '';
    const params = new URLSearchParams({
      autoplay: '1',
      playsinline: '1',
      controls: '1',
      rel: '0',
      iv_load_policy: '3',
      fs: '1',
      color: 'white'
    });
    return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?' + params.toString();
  } catch (_) {
    return '';
  }
}

function vimeoEmbedUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (!isVimeoHost(host)) return '';
    const id = url.pathname.split('/').filter(Boolean).find(part => /^\d+$/.test(part)) || '';
    if (!id) return '';
    return 'https://player.vimeo.com/video/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1&dnt=1';
  } catch (_) {
    return '';
  }
}

function stopPortfolioVideo() {
  if (portfolioVideo) {
    try { portfolioVideo.pause(); } catch (_) {}
    portfolioVideo.oncanplay = null;
    portfolioVideo.onerror = null;
    portfolioVideo.removeAttribute('src');
    portfolioVideo.removeAttribute('poster');
    portfolioVideo.load();
    portfolioVideo.hidden = true;
  }
  if (portfolioVideoEmbed) {
    portfolioVideoEmbed.onload = null;
    portfolioVideoEmbed.src = 'about:blank';
    portfolioVideoEmbed.hidden = true;
  }
  if (videoLoading) {
    videoLoading.textContent = 'Carregando vídeo…';
    videoLoading.hidden = true;
  }
}

async function openVideo(id, trigger) {
  const project = PROJECTS[id];
  if (!project || !videoModal) return;
  const raw = safeMediaUrl(project.video);
  if (!raw) return;

  lastStoryTrigger = trigger || lastStoryTrigger;
  stopPortfolioVideo();
  if (videoLoading) {
    videoLoading.textContent = 'Carregando vídeo em alta qualidade…';
    videoLoading.hidden = false;
  }

  const youtube = youtubeEmbedUrl(raw);
  const vimeo = vimeoEmbedUrl(raw);
  let knownProvider = false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    knownProvider = isYouTubeHost(host) || isVimeoHost(host);
  } catch (_) {}

  if (knownProvider && !youtube && !vimeo) {
    if (videoLoading) {
      videoLoading.hidden = false;
      videoLoading.textContent = 'Link de vídeo inválido. Confira o link no painel administrativo.';
    }
  } else if (youtube || vimeo) {
    if (!portfolioVideoEmbed) return;
    portfolioVideoEmbed.hidden = false;
    portfolioVideoEmbed.title = 'Assistir: ' + (project.title || 'Vídeo Stoski Films');
    portfolioVideoEmbed.src = youtube || vimeo;
    portfolioVideoEmbed.onload = () => { if (videoLoading) videoLoading.hidden = true; };
  } else if (!knownProvider && portfolioVideo) {
    portfolioVideo.hidden = false;
    portfolioVideo.poster = project.image || '';
    portfolioVideo.src = raw;
    portfolioVideo.oncanplay = () => { if (videoLoading) videoLoading.hidden = true; };
    portfolioVideo.onerror = () => {
      if (videoLoading) {
        videoLoading.hidden = false;
        videoLoading.textContent = 'Não foi possível reproduzir este vídeo.';
      }
    };
  }

  if (typeof videoModal.showModal === 'function') videoModal.showModal();
  else videoModal.setAttribute('open', '');

  // Tela cheia permanece sob controle do visitante pelo player de vídeo.

  if (!knownProvider && !youtube && !vimeo && portfolioVideo) {
    try { await portfolioVideo.play(); } catch (_) {}
  }
}

function fillStory(id) {
  const project = PROJECTS[id];
  if (!project || !storyModal) return;
  const image=qs('#story-image'), category=qs('#story-category'), title=qs('#story-title'), subtitle=qs('#story-subtitle'), text=qs('#story-text');
  if (image) { image.src=project.image; image.alt=project.title; }
  if (category) category.textContent=project.category;
  if (title) title.textContent=project.title;
  if (subtitle) subtitle.textContent=project.subtitle;
  if (text) text.textContent=project.story;
}

function openStory(card) {
  const id = card?.dataset.project;
  if (!id || !PROJECTS[id] || !storyModal) return;
  lastStoryTrigger=card;
  fillStory(id);
  if (typeof storyModal.showModal === 'function') storyModal.showModal();
  else storyModal.setAttribute('open','');
  qs('.story-close',storyModal)?.focus();
}

document.addEventListener('click', event => {
  const play = event.target.closest('[data-video-project]');
  if (play) {
    event.preventDefault();
    event.stopPropagation();
    openVideo(play.dataset.videoProject, play);
    return;
  }

  const card = event.target.closest('.work-card[data-project]');
  if (card && !event.target.closest('#story-modal') && !event.target.closest('#video-modal')) openStory(card);
});

document.addEventListener('keydown', event => {
  if (!['Enter',' '].includes(event.key)) return;
  if (event.target.closest?.('[data-video-project]')) return;
  const card = event.target.closest?.('.work-card[data-project]');
  if (!card) return;
  event.preventDefault();
  openStory(card);
});

qs('.story-close',storyModal)?.addEventListener('click', () => storyModal.close());
qs('#story-budget')?.addEventListener('click', () => storyModal?.close());
storyModal?.addEventListener('close', () => lastStoryTrigger?.focus());
storyModal?.addEventListener('click', event => {
  const rect=storyModal.getBoundingClientRect();
  const inside=event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom;
  if (!inside) storyModal.close();
});

qs('.video-close',videoModal)?.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (_) {}
  videoModal?.close();
});
videoModal?.addEventListener('close', () => {
  stopPortfolioVideo();
  lastStoryTrigger?.focus?.();
});
videoModal?.addEventListener('click', event => {
  const rect=videoModal.getBoundingClientRect();
  const inside=event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom;
  if (!inside) videoModal.close();
});

function validateField(field) {
  const wrap=field.closest('.field');
  const error=wrap?.querySelector('.error');
  if (!wrap || !error) return true;
  const value=field.value.trim();
  let message='';
  if (field.required && !value) message='Preencha este campo.';
  if (!message && value && field.id==='date' && field.min && value < field.min) message='Escolha a data de hoje ou uma data futura.';
  if (!message && field.validity?.badInput) message='Informe um valor válido.';
  wrap.classList.toggle('invalid',Boolean(message));
  field.setAttribute('aria-invalid',String(Boolean(message)));
  if (!error.id && field.id) error.id=field.id+'-error';
  if (error.id) field.setAttribute('aria-describedby',error.id);
  error.textContent=message;
  return !message;
}

qsa('#budget-form input, #budget-form select, #budget-form textarea').forEach(field => {
  field.addEventListener('blur', () => validateField(field));
  field.addEventListener('input', () => {
    if (field.closest('.field')?.classList.contains('invalid')) validateField(field);
  });
});

function formatDateBR(raw) {
  if (!raw) return '';
  const [year,month,day]=raw.split('-');
  return year && month && day ? `${day}/${month}/${year}` : raw;
}

function buildWhatsAppMessage(data) {
  const lines=[
    WHATSAPP_GREETING,
    '',
    `*Nome:* ${String(data.get('name')||'').trim()}`
  ];
  if (data.get('eventType')) {
    const eventLabel = ({'Casamentos':'Casamento','15 anos':'15 anos','Outros serviços':'Outros eventos e projetos'})[data.get('eventType')] || data.get('eventType');
    lines.push(`*Tipo de evento:* ${eventLabel}`, '', '*Serviços desejados:*');
    for (const service of data.getAll('selectedService')) lines.push('• ' + service);
  } else {
    lines.push(`*Serviço:* ${data.get('service')}`);
  }
  const date=String(data.get('date')||'').trim();
  const time=String(data.get('time')||'').trim();
  const city=String(data.get('city')||'').trim();
  const details=String(data.get('message')||'').trim();
  lines.push('', `*Data do evento:* ${date ? formatDateBR(date) : 'A definir'}`);
  if (time) lines.push(`*Horário aproximado:* ${time}`);
  if (city) lines.push(`*Cidade / local:* ${city}`);
  if (details) lines.push(`*Detalhes:* ${details}`);
  lines.push('','Gostaria de saber sobre disponibilidade e orçamento para esse projeto.');
  return lines.join('\n');
}

form?.addEventListener('submit', event => {
  event.preventDefault();
  const fields=qsa('.field input, .field select, .field textarea',form);
  const valid=fields.map(validateField).every(Boolean);
  const packageValid=quotePackage ? quotePackage.validate() : true;
  if (!valid || !packageValid) {
    if (status) status.textContent='Revise os campos destacados e selecione pelo menos um serviço.';
    if (!packageValid && quotePackage) quotePackage.focusInvalid();
    else qs('.field.invalid input, .field.invalid select, .field.invalid textarea',form)?.focus();
    return;
  }
  const data=new FormData(form);
  if (quotePackage) quotePackage.selected().forEach(title => data.append('selectedService', title));
  const message=buildWhatsAppMessage(data);
  const url=`https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
  if (status) status.textContent='Abrindo o WhatsApp do Henrique com sua solicitação pronta…';
  window.location.assign(url);
});

qsa('a[href*="instagram.com/stoski_films"]').forEach(link => { link.href=INSTAGRAM_URL; });
/* Rotas reais: links antigos do CMS continuam funcionando entre páginas. */
const routeForAnchor = Object.freeze({
  '#topo':'index.html#topo',
  '#showreel':'portfolio.html#trabalhos',
  '#trabalhos':'portfolio.html#trabalhos',
  '#servicos':'servicos.html#servicos',
  '#sobre':'index.html#sobre',
  '#processo':'servicos.html#processo',
  '#faq':'servicos.html#faq',
  '#orcamento':'contato.html#orcamento'
});
function repairAnchors() {
  qsa('a[href^="#"]').forEach(link => {
    const hash = link.getAttribute('href');
    if (!hash || hash === '#' || document.getElementById(hash.slice(1))) return;
    if (routeForAnchor[hash]) link.href = routeForAnchor[hash];
  });
}
repairAnchors();
document.addEventListener('stoski:config', repairAnchors);

/* Filtros responsivos alimentados pelo mesmo conteúdo gerenciável no ADM. */
const filterButtons = qsa('[data-work-filter]');
function normalizedCategory(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function applyProjectFilter(filter = 'todos') {
  filterButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.workFilter === filter));
  });
  qsa('.work-card').forEach(card => {
    const label = normalizedCategory(card.querySelector('.work-meta')?.textContent);
    const match = filter === 'todos'
      || (filter === 'casamentos' && /casament|love stor|wedding/.test(label))
      || (filter === 'eventos' && /evento|celebra|festa/.test(label))
      || (filter === 'comerciais' && /comercial|marca|reel|empresa|publicitar|institucional/.test(label));
    card.hidden = !match;
  });
}
filterButtons.forEach(button => button.addEventListener('click', () => applyProjectFilter(button.dataset.workFilter)));
document.addEventListener('stoski:config', () => {
  const selected = qs('[data-work-filter][aria-pressed="true"]')?.dataset.workFilter || 'todos';
  applyProjectFilter(selected);
});



// Configurador de pacotes: o catálogo do ADM é a fonte principal; HTML local é a contingência.
function initQuotePackage() {
  const eventSelect = qs('#event-type');
  if (!eventSelect) return null;
  const step = qs('#quote-services-step');
  const list = qs('#quote-services');
  const count = qs('#quote-service-count');
  const clear = qs('#quote-clear');
  const error = qs('#quote-selection-error');
  const summaryEvent = qs('#quote-summary-event');
  const summaryList = qs('#quote-summary-list');
  const empty = qs('#quote-summary-empty');
  const overlapNote = qs('#quote-overlap-note');
  const params = new URLSearchParams(window.location.search);
  const requestTitle = params.get('servico')?.trim() || '';
  const requestCategory = params.get('evento')?.trim() || '';
  const aliases = new Map([
    ['Filmes de casamento','Filme de casamento'],
    ['Filmagem de evento','Eventos & celebrações'],
    ['Reels / vídeo comercial','Reels & vídeos comerciais']
  ]);
  const normalizeTitle = value => aliases.get(value) || value;
  const prettyCategory = value => ({'Casamentos':'Casamento','15 anos':'15 anos','Outros serviços':'Outros eventos e projetos'})[value] || value;
  const selection = new Map();
  let catalog = [];
  let interacted = false;
  let requestedApplied = false;
  let fallback = [];
  try { fallback = JSON.parse(qs('#quote-catalog')?.textContent || '[]'); } catch (_) {}

  function getSelection(category = eventSelect.value) {
    if (!selection.has(category)) selection.set(category, new Set());
    return selection.get(category);
  }
  function visibleItems() { return catalog.filter(item => item.category === eventSelect.value); }
  function selected() {
    const chosen = getSelection();
    return visibleItems().filter(item => chosen.has(item.title)).map(item => item.title);
  }
  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }
  function refreshSummary() {
    const chosen = selected();
    const length = chosen.length;
    count.textContent = length + (length === 1 ? ' serviço selecionado' : ' serviços selecionados');
    clear.disabled = length === 0;
    if (overlapNote) overlapNote.hidden = !chosen.some(title => /cobertura completa/i.test(title));
    summaryEvent.textContent = eventSelect.value ? prettyCategory(eventSelect.value) : 'Escolha o tipo de evento';
    summaryList.replaceChildren(...chosen.map(title => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = title;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quote-remove';
      remove.textContent = 'Remover';
      remove.setAttribute('aria-label', 'Remover ' + title);
      remove.addEventListener('click', () => {
        interacted = true;
        getSelection().delete(title);
        const row = Array.from(list.querySelectorAll('.quote-service-choice')).find(el => el.dataset.title === title);
        const no = row?.querySelector('input[value="nao"]');
        if (no) no.checked = true;
        refreshSummary();
        (no || eventSelect).focus();
      });
      li.append(label, remove);
      return li;
    }));
    empty.hidden = length > 0;
    if (length > 0) clearError();
  }
  function renderServices() {
    step.hidden = !eventSelect.value;
    list.replaceChildren();
    clearError();
    if (!eventSelect.value) { refreshSummary(); return; }
    const chosen = getSelection();
    visibleItems().forEach((item, index) => {
      const row = document.createElement('fieldset');
      row.className = 'quote-service-choice';
      row.dataset.title = item.title;
      const legend = document.createElement('legend');
      legend.textContent = item.title;
      const content = document.createElement('div');
      content.className = 'quote-service-content';
      const description = document.createElement('p');
      description.textContent = item.description || 'Inclua esta opção na sua solicitação.';
      const toggle = document.createElement('div');
      toggle.className = 'quote-toggle';
      for (const [value,label] of [['nao','Não'],['sim','Sim']]) {
        const option = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'quoteChoice' + index;
        input.value = value;
        input.checked = chosen.has(item.title) === (value === 'sim');
        const caption = document.createElement('span');
        caption.textContent = label;
        input.addEventListener('change', () => {
          interacted = true;
          if (value === 'sim') chosen.add(item.title); else chosen.delete(item.title);
          refreshSummary();
        });
        option.append(input,caption);
        toggle.append(option);
      }
      content.append(description,toggle);
      row.append(legend,content);
      list.append(row);
    });
    refreshSummary();
  }
  function loadCatalog(config) {
    const previousCategory = eventSelect.value;
    const source = Array.isArray(config?.services?.items) ? config.services.items : fallback;
    const seen = new Set();
    catalog = [];
    for (const item of source) {
      const title = String(item?.title || '').trim();
      const description = String(item?.description || '').trim();
      const category = String(item?.category || 'Outros serviços').trim() || 'Outros serviços';
      if (!title || !description || title === 'Novo serviço' || description === 'Descreva este serviço.') continue;
      const key = category + '\\u0000' + title;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({ title, description, category });
    }
    // Opções extras do painel de contato só entram em Outros serviços e não duplicam o catálogo.
    // Os nomes legados que já foram migrados não ressurgem se o ADM remover o serviço original.
    const legacy = new Set(['Filme de casamento','Filmes de casamento','Filmagem de evento','Eventos & celebrações','Reels / vídeo comercial','Reels & vídeos comerciais','Edição & pós-produção','Produção audiovisual']);
    const extras = Array.isArray(config?.budget?.serviceOptions) ? config.budget.serviceOptions : ['Outro projeto em vídeo'];
    for (const raw of extras) {
      const title = String(raw || '').trim();
      if (!title || legacy.has(title) || catalog.some(item => item.title === title || item.title === normalizeTitle(title))) continue;
      catalog.push({title,description:'Conte os detalhes do projeto no formulário.',category:'Outros serviços'});
    }
    const categories = [...new Set(catalog.map(item => item.category))];
    eventSelect.replaceChildren(new Option('Selecione seu evento',''), ...categories.map(category => new Option(prettyCategory(category),category)));
    if (categories.includes(previousCategory)) eventSelect.value = previousCategory;
    // A atualização do CMS nunca desfaz uma escolha válida feita enquanto carregava.
    for (const [category, chosen] of selection) {
      for (const title of chosen) if (!catalog.some(item => item.category === category && item.title === title)) chosen.delete(title);
    }
    if (!interacted && !requestedApplied) {
      const matches = item => item.title === requestTitle || item.title === normalizeTitle(requestTitle);
      const item = catalog.find(item => item.category === requestCategory && matches(item)) || (!requestCategory ? catalog.find(matches) : undefined);
      if (item) {
        eventSelect.value = item.category;
        getSelection(item.category).add(item.title);
        requestedApplied = true;
      } else if (categories.includes(requestCategory)) {
        eventSelect.value = requestCategory;
        requestedApplied = true;
      }
    }
    renderServices();
  }
  eventSelect.addEventListener('change', () => {
    interacted = true;
    renderServices();
  });
  clear.addEventListener('click', () => {
    interacted = true;
    getSelection().clear();
    renderServices();
    list.querySelector('input')?.focus();
  });
  document.addEventListener('stoski:config', event => loadCatalog(event.detail));
  loadCatalog(window.STOSKI_CONFIG);
  return {
    selected,
    validate() {
      if (!eventSelect.value) return false;
      if (selected().length) return true;
      error.textContent = 'Selecione pelo menos um serviço para solicitar o orçamento.';
      error.hidden = false;
      return false;
    },
    focusInvalid() {
      if (!eventSelect.value) eventSelect.focus();
      else list.querySelector('input[value="sim"]')?.focus();
    }
  };
}
const quotePackage = initQuotePackage();

/* Service cards link to the quote form, including CMS-rendered cards. */
const serviceAliases = new Map([
  ['Filmes de casamento', 'Filme de casamento'],
  ['Eventos & celebrações', 'Filmagem de evento'],
  ['Reels & vídeos comerciais', 'Reels / vídeo comercial'],
  ['Edição & pós-produção', 'Edição & pós-produção'],
  ['Produção audiovisual', 'Produção audiovisual']
]);
function serviceQuoteUrl(title, category) {
  return 'contato.html?servico=' + encodeURIComponent(title) + (category ? '&evento=' + encodeURIComponent(category) : '') + '#orcamento';
}
function enableServiceLinks() {
  qsa('.services-list .service-row').forEach(row => {
    const title = row.querySelector('h3')?.textContent.trim();
    if (!title) return;
    const link = row.tagName === 'A' ? row : document.createElement('a');
    if (link !== row) {
      link.className = row.className;
      link.append(...row.childNodes);
      row.replaceWith(link);
    }
    link.href = serviceQuoteUrl(title, row.dataset.category || row.closest('.service-category')?.dataset.category);
    link.classList.add('service-link');
    link.setAttribute('aria-label', 'Adicionar ao pacote: ' + title);
  });
}
const quoteService = qs('#service');
const requestedService = new URLSearchParams(window.location.search).get('servico')?.trim() || '';
let serviceChanged = false;
let chosenService = '';
quoteService?.addEventListener('change', () => {
  serviceChanged = true;
  chosenService = quoteService.value;
});
function selectQuotedService(config) {
  if (!quoteService) return;
  const requested = serviceChanged ? chosenService : requestedService;
  if (!requested) {
    if (serviceChanged) quoteService.value = '';
    return;
  }
  const alias = serviceAliases.get(requested);
  const values = [...quoteService.options].map(option => option.value);
  const match = values.includes(requested) ? requested : values.includes(alias) ? alias : null;
  if (match !== null) {
    quoteService.value = match;
    return;
  }
  const configured = config?.services?.items;
  const known = serviceAliases.has(requested) || (Array.isArray(configured) &&
    configured.some(item => String(item.title || '').trim() === requested));
  if (known || serviceChanged) {
    const option = new Option(requested, requested);
    quoteService.add(option);
    quoteService.value = requested;
  }
}
enableServiceLinks();
selectQuotedService(window.STOSKI_CONFIG);
document.addEventListener('stoski:config', event => {
  enableServiceLinks();
  selectQuotedService(event.detail);
});
