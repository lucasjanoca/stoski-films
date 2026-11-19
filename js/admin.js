'use strict';

(function () {
  const SUPABASE_URL = 'https://yncspxfsvlqdnodlsosb.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jALAHHuvrV5oxj2mugWTCQ_stD_vFyN';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  const q = (selector, scope = document) => scope.querySelector(selector);
  const qa = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const authScreen = q('#auth-screen');
  const unauthorizedScreen = q('#unauthorized-screen');
  const dashboard = q('#dashboard');
  const authStatus = q('#auth-status');
  const globalStatus = q('#global-status');
  const saveIndicator = q('#save-indicator');
  const saveBtn = q('#save-btn');
  const mobileSaveBtn = q('#mobile-save-btn');
  const mobileSaveBar = q('#mobile-save-bar');

  let currentUser = null;
  let currentAdmin = null;
  let config = null;
  let savedConfig = null;
  let revision = 0;
  let dirty = false;
  let saveTimer = null;
  let draftTimer = null;
  let activeUploads = 0;
  let saving = false;
  const DRAFT_PREFIX = "stoski_editor_draft_v1_";

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getPath(object, path) {
    return String(path).split('.').reduce((acc, key) => acc == null ? undefined : acc[key], object);
  }

  function setPath(object, path, value) {
    const keys = String(path).split('.');
    let cursor = object;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        cursor[key] = value;
      } else {
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
      }
    });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[ch]));
  }

  function showStatus(message, type = 'info', timeout = 4500) {
    if (!globalStatus) return;
    globalStatus.textContent = message || '';
    globalStatus.className = 'status global-status ' + type;
    if (timeout) {
      clearTimeout(showStatus.timer);
      showStatus.timer = setTimeout(() => {
        globalStatus.textContent = '';
        globalStatus.className = 'status global-status';
      }, timeout);
    }
  }

  function setAuthStatus(message, type = 'info') {
    authStatus.textContent = message || '';
    authStatus.className = 'status ' + type;
  }

  function authErrorMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
    if (message.includes('user already registered')) return 'Essa conta já existe. Use “Entrar” ou “Esqueci a senha”.';
    if (message.includes('password') && message.includes('characters')) return 'A senha não atende aos requisitos de segurança.';
    if (message.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';
    if (message.includes('email address') && message.includes('invalid')) return 'Informe um e-mail válido.';
    return error?.message || 'Não foi possível concluir esta ação.';
  }

  function setDirty(value = true) {
    dirty = value;
    if (saveIndicator) {
      saveIndicator.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
      saveIndicator.classList.toggle('dirty', dirty);
    }
    if (saveBtn) saveBtn.disabled = !dirty || !currentAdmin || saving || activeUploads > 0;
    if (mobileSaveBtn) mobileSaveBtn.disabled = !dirty || !currentAdmin || saving || activeUploads > 0;
    const discard = q('#discard-btn');
    if (discard) discard.disabled = !dirty || saving || activeUploads > 0;
    if (mobileSaveBar) mobileSaveBar.hidden = !dirty;
    document.body.classList.toggle('has-pending-changes', dirty);
  }

  function markDirty() {
    setDirty(true);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(storeLocalDraft, 600);
  }

  /* Rascunho local por usuário: nunca publica automaticamente nem acessa senhas. */
  function draftKey() {
    return currentUser?.id ? DRAFT_PREFIX + currentUser.id : null;
  }

  function storeLocalDraft() {
    const key = draftKey();
    if (!key || !dirty || !config) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        revision,
        savedAt: Date.now(),
        data: config
      }));
    } catch (_) { /* armazenamento privado ou indisponível */ }
  }

  function clearLocalDraft() {
    clearTimeout(draftTimer);
    const key = draftKey();
    try { if (key) localStorage.removeItem(key); } catch (_) {}
    q('#draft-restore')?.classList.add('hidden');
  }

  function getLocalDraft() {
    const key = draftKey();
    if (!key) return null;
    try {
      const entry = JSON.parse(localStorage.getItem(key) || 'null');
      if (!entry?.data || entry.revision !== revision || Date.now() - entry.savedAt > 604800000) {
        if (entry) localStorage.removeItem(key);
        return null;
      }
      return entry;
    } catch (_) { return null; }
  }

  function displayDraftRecovery() {
    q('#draft-restore')?.classList.toggle('hidden', !getLocalDraft());
  }

  function restoreLocalDraft() {
    const entry = getLocalDraft();
    if (!entry || !savedConfig) {
      q('#draft-restore')?.classList.add('hidden');
      return;
    }
    config = deepClone(entry.data);
    renderAll();
    markDirty();
    q('#draft-restore')?.classList.add('hidden');
    showStatus('Rascunho recuperado neste aparelho. Clique em Salvar e publicar quando estiver pronto.', 'success', 7000);
  }

  function discardChanges() {
    if (!dirty || !savedConfig || !window.confirm('Descartar todas as alterações que ainda não foram publicadas?')) return;
    config = deepClone(savedConfig);
    renderAll();
    setDirty(false);
    clearLocalDraft();
    showStatus('Alterações descartadas. O conteúdo publicado foi mantido.', 'success');
  }


  function showOnly(view) {
    authScreen.classList.toggle('hidden', view !== 'auth');
    unauthorizedScreen.classList.toggle('hidden', view !== 'unauthorized');
    dashboard.classList.toggle('hidden', view !== 'dashboard');
  }

  async function init() {
    bindStaticEvents();

    client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        const dialog = q('#password-dialog');
        if (dialog && !dialog.open) dialog.showModal();
        q('#new-password')?.focus();
      }

      if (session?.user && (!currentUser || currentUser.id !== session.user.id)) {
        await enterWithUser(session.user);
      }
      if (!session?.user && currentUser) {
        currentUser = null;
        currentAdmin = null;
        showOnly('auth');
      }
    });

    const { data } = await client.auth.getSession();
    if (data?.session?.user) await enterWithUser(data.session.user);
    else showOnly('auth');
  }

  function bindStaticEvents() {
    q('#login-form')?.addEventListener('submit', loginWithPassword);
    q('#magic-link-btn')?.addEventListener('click', sendMagicLink);
    q('#signup-btn')?.addEventListener('click', signUp);
    q('#reset-btn')?.addEventListener('click', resetPassword);
    q('#logout-btn')?.addEventListener('click', logout);
    q('#unauthorized-logout')?.addEventListener('click', logout);
    saveBtn?.addEventListener('click', saveConfig);
    mobileSaveBtn?.addEventListener('click', saveConfig);
    q('#toggle-password')?.addEventListener('click', () => {
      const field = q('#login-password');
      const button = q('#toggle-password');
      const showing = field.type === 'password';
      field.type = showing ? 'text' : 'password';
      button.textContent = showing ? 'Ocultar senha' : 'Mostrar senha';
      button.setAttribute('aria-pressed', String(showing));
    });
    q('#add-admin-btn')?.addEventListener('click', openAdminDialog);
    q('#admin-cancel-btn')?.addEventListener('click', () => q('#admin-dialog')?.close());
    q('#admin-form')?.addEventListener('submit', addAdmin);
    q('#media-preview-close')?.addEventListener('click', closeMediaPreview);
    q('#password-form')?.addEventListener('submit', updateRecoveredPassword);
    q('#password-cancel')?.addEventListener('click', () => q('#password-dialog')?.close());
    q('#password-cancel-footer')?.addEventListener('click', () => q('#password-dialog')?.close());

    q('#admin-nav')?.addEventListener('click', event => {
      const button = event.target.closest('[data-panel]');
      if (!button) return;
      activatePanel(button.dataset.panel);
    });

    q('#mobile-menu')?.addEventListener('click', openSidebar);
    q('#sidebar-close')?.addEventListener('click', closeSidebar);
    q('#sidebar-backdrop')?.addEventListener('click', closeSidebar);
    q('#discard-btn')?.addEventListener('click', discardChanges);
    q('#restore-draft-btn')?.addEventListener('click', restoreLocalDraft);
    q('#delete-draft-btn')?.addEventListener('click', () => { clearLocalDraft(); showStatus('Rascunho local descartado.', 'success'); });
    q('#project-search')?.addEventListener('input', filterProjectCards);
    document.addEventListener('toggle', event => { if (event.target.matches?.('.project-editor-details') && event.target.open) { qa('.project-editor-details').forEach(other => { if (other !== event.target) other.open = false; }); } }, true);

    document.addEventListener('input', onFieldInput);
    document.addEventListener('change', onFieldInput);
    document.addEventListener('click', onDynamicClick);

    window.addEventListener('beforeunload', event => {
      if (!dirty) return;
      storeLocalDraft();
      event.preventDefault();
      event.returnValue = '';
    });
  }

  async function loginWithPassword(event) {
    event.preventDefault();
    const email = q('#login-email').value.trim();
    const password = q('#login-password').value;
    if (!email || !password) {
      setAuthStatus('Informe e-mail e senha.', 'error');
      return;
    }
    setAuthStatus('Entrando…');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthStatus(authErrorMessage(error), 'error');
      return;
    }
    if (data?.user) await enterWithUser(data.user);
  }

  async function sendMagicLink() {
    const email = q('#login-email').value.trim();
    if (!email) {
      setAuthStatus('Digite seu e-mail primeiro.', 'error');
      q('#login-email').focus();
      return;
    }
    setAuthStatus('Enviando link…');
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    setAuthStatus(error ? authErrorMessage(error) : 'Link enviado. Confira seu e-mail.', error ? 'error' : 'success');
  }

  async function signUp() {
    const email = q('#login-email').value.trim();
    const password = q('#login-password').value;
    if (!email || !password || password.length < 10) {
      setAuthStatus('Para criar conta, informe e-mail e uma senha com pelo menos 10 caracteres.', 'error');
      return;
    }
    setAuthStatus('Criando conta…');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) {
      setAuthStatus(authErrorMessage(error), 'error');
      return;
    }
    if (data?.session?.user) {
      await enterWithUser(data.session.user);
    } else {
      setAuthStatus('Conta criada. Confirme o e-mail para entrar.', 'success');
    }
  }

  async function resetPassword() {
    const email = q('#login-email').value.trim();
    if (!email) {
      setAuthStatus('Digite seu e-mail primeiro.', 'error');
      return;
    }
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    setAuthStatus(error ? authErrorMessage(error) : 'Enviamos um link para redefinir sua senha.', error ? 'error' : 'success');
  }

  async function updateRecoveredPassword(event) {
    event.preventDefault();
    const first = q('#new-password')?.value || '';
    const second = q('#confirm-password')?.value || '';
    const status = q('#password-status');

    if (first.length < 10) {
      status.textContent = 'Use uma senha com pelo menos 10 caracteres.';
      status.className = 'status error';
      return;
    }
    if (first !== second) {
      status.textContent = 'As duas senhas precisam ser iguais.';
      status.className = 'status error';
      return;
    }

    const { error } = await client.auth.updateUser({ password: first });
    if (error) {
      status.textContent = authErrorMessage(error);
      status.className = 'status error';
      return;
    }

    q('#new-password').value = '';
    q('#confirm-password').value = '';
    status.textContent = '';
    q('#password-dialog')?.close();
    showStatus('Senha atualizada com sucesso.', 'success');
  }

  async function logout() {
    await client.auth.signOut();
    currentUser = null;
    currentAdmin = null;
    config = null;
    savedConfig = null;
    setDirty(false);
    showOnly('auth');
  }

  async function enterWithUser(user) {
    currentUser = user;
    const { data, error } = await client
      .from('stoski_admins')
      .select('id,user_id,email,name,role,active')
      .eq('active', true);

    if (error) {
      console.warn(error);
      currentAdmin = null;
      showOnly('unauthorized');
      return;
    }

    currentAdmin = (data || []).find(item => item.user_id === user.id) || null;
    if (!currentAdmin) {
      showOnly('unauthorized');
      return;
    }

    q('#user-name').textContent = currentAdmin.name || (currentAdmin.role === 'owner' ? 'Proprietário' : 'Editor');
    q('#user-email').textContent = user.email || '';
    document.body.dataset.role = currentAdmin.role;
    qa('.owner-only').forEach(el => el.classList.toggle('hidden-owner', currentAdmin.role !== 'owner'));

    showOnly('dashboard');
    await loadConfig();
    await loadAdmins();
  }

  async function loadConfig() {
    showStatus('Carregando conteúdo…', 'info', 0);
    const { data, error } = await client
      .from('stoski_site_config')
      .select('data,revision,updated_at,updated_by')
      .eq('id', 1)
      .single();

    if (error || !data?.data) {
      showStatus('Não foi possível carregar o conteúdo: ' + (error?.message || 'configuração ausente'), 'error', 0);
      return;
    }

    config = deepClone(data.data);
    savedConfig = deepClone(data.data);
    revision = data.revision || 1;
    renderAll();
    setDirty(false);
    displayDraftRecovery();
    showStatus('Painel carregado.', 'success');
  }

  function renderAll() {
    if (!config) return;

    qa('[data-path]').forEach(input => {
      if (input.dataset.objectIndex !== undefined) return;
      const value = getPath(config, input.dataset.path);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (value !== undefined && value !== null) input.value = value;
      else input.value = '';
    });

    qa('[data-string-list]').forEach(renderStringList);
    qa('[data-object-list]').forEach(renderObjectList);
    updateStats();
    refreshMediaPreviews();
    filterProjectCards();
  }

  function refreshMediaPreviews() {
    [
      ['#showreel-cover-preview', getPath(config, 'showreel.cover')],
      ['#about-photo-preview', getPath(config, 'about.image')]
    ].forEach(([selector, value]) => {
      const img = q(selector);
      if (!img) return;
      const url = String(value || '').trim();
      const safe = /^(https?:\/\/|assets\/)/i.test(url);
      img.hidden = !safe;
      if (safe) img.src = url;
      else img.removeAttribute('src');
    });
  }

  function filterProjectCards() {
    const input = q('#project-search');
    const query = String(input?.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const cards = qa('#project-list .portfolio-editor');
    let count = 0;
    cards.forEach(card => {
      const index = Number(card.dataset.projectIndex);
      const item = getPath(config, 'portfolio.items')?.[index] || {};
      const haystack = [item.title, item.category, item.subtitle].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const match = !query || haystack.includes(query);
      card.hidden = !match;
      if (match) count++;
    });
    const label = q('#project-results');
    if (label) label.textContent = query
      ? count + ' de ' + cards.length + ' trabalho(s) encontrado(s)'
      : cards.length + ' trabalho(s) cadastrado(s)';
  }

  function updateProjectSummary(card) {
    if (!card) return;
    const index = Number(card.dataset.projectIndex);
    const item = getPath(config, 'portfolio.items')?.[index];
    if (!item) return;
    const title = q('.project-editor-copy strong', card);
    const sub = q('.project-editor-copy small', card);
    if (title) title.textContent = item.title?.trim() || 'Novo trabalho';
    if (sub) sub.textContent = (item.category?.trim() || 'Sem categoria') + ' · ' + (item.video ? 'Vídeo adicionado' : 'Sem vídeo');
  }

  function updateStats() {
    q('#stat-services').textContent = getPath(config, 'services.items')?.length ?? 0;
    q('#stat-projects').textContent = getPath(config, 'portfolio.items')?.length ?? 0;
    q('#stat-faqs').textContent = getPath(config, 'faq.items')?.length ?? 0;
  }

  function renderStringList(container) {
    const path = container.dataset.stringList;
    const list = getPath(config, path);
    const values = Array.isArray(list) ? list : [];
    container.innerHTML = values.map((value, index) =>
      '<div class="repeat-row">' +
        '<input type="text" value="' + esc(value) + '" data-string-path="' + esc(path) + '" data-index="' + index + '">' +
        '<div class="repeat-actions">' +
          '<button class="icon-btn" type="button" data-move-string="up" data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Subir">↑</button>' +
          '<button class="icon-btn" type="button" data-move-string="down" data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Descer">↓</button>' +
          '<button class="icon-btn danger-icon" type="button" data-remove-string data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Remover">×</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  function renderObjectList(container) {
    const path = container.dataset.objectList;
    const template = container.dataset.template;
    const list = getPath(config, path);
    const values = Array.isArray(list) ? list : [];

    container.innerHTML = values.map((item, index) => {
      const controls =
        '<div class="card-actions">' +
          '<button class="icon-btn" type="button" data-move-item="up" data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Subir">↑</button>' +
          '<button class="icon-btn" type="button" data-move-item="down" data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Descer">↓</button>' +
          '<button class="icon-btn danger-icon" type="button" data-remove-item data-list-path="' + esc(path) + '" data-index="' + index + '" aria-label="Excluir">×</button>' +
        '</div>';

      if (template === 'service') {
        return '<article class="repeat-card">' + controls +
          '<span class="card-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          objectInput(path, index, 'title', 'Nome do serviço', item.title) +
          objectTextarea(path, index, 'description', 'Descrição', item.description, 3) +
        '</article>';
      }

      if (template === 'simple') {
        return '<article class="repeat-card">' + controls +
          '<span class="card-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          objectInput(path, index, 'title', 'Título', item.title) +
          objectTextarea(path, index, 'text', 'Texto', item.text, 3) +
        '</article>';
      }

      if (template === 'faq') {
        return '<article class="repeat-card">' + controls +
          '<span class="card-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          objectInput(path, index, 'question', 'Pergunta', item.question) +
          objectTextarea(path, index, 'answer', 'Resposta', item.answer, 4) +
        '</article>';
      }

      if (template === 'portfolio') {
        return '<article class="repeat-card portfolio-editor" data-project-index="' + index + '">' +
          '<details class="project-editor-details"' + (index === 0 ? ' open' : '') + '>' +
          '<summary class="project-editor-summary"><span class="project-editor-thumbnail">' +
          (item.image && /^(https?:\/\/|assets\/)/i.test(item.image) ? '<img src="' + esc(item.image) + '" alt="">' : '▶') +
          '</span><span class="project-editor-copy"><strong>' + esc(item.title || 'Novo trabalho') + '</strong><small>' + esc(item.category || 'Sem categoria') + ' · ' + (item.video ? 'Vídeo adicionado' : 'Sem vídeo') + '</small></span><span class="project-editor-arrow" aria-hidden="true">⌄</span></summary>' +
          '<div class="project-editor-body">' + controls +
          '<span class="card-index">' + String(index + 1).padStart(2, '0') + '</span>' +
          '<div class="form-grid two">' +
            objectInput(path, index, 'title', 'Nome do trabalho', item.title) +
            '<label><span>Categoria</span><input type="text" list="portfolio-category-options" value="' + esc(item.category || '') + '" data-object-path="' + esc(path) + '" data-index="' + index + '" data-key="category" placeholder="Ex.: Eventos"></label>' +
          '</div>' +
          objectTextarea(path, index, 'story', 'Descrição do trabalho', item.story, 4) +
          '<details class="advanced-fields"><summary>Mais detalhes (opcional)</summary><div class="form-grid two">' +
            objectInput(path, index, 'subtitle', 'Subtítulo', item.subtitle) +
            objectInput(path, index, 'id', 'Identificador do projeto', item.id || String(index + 1)) +
          '</div></details>' +
          '<div class="upload-field compact">' +
            '<div><span>Imagem de capa</span><small>Essa imagem aparece antes do vídeo.</small></div>' +
            '<input type="text" value="' + esc(item.image || '') + '" data-object-path="' + esc(path) + '" data-index="' + index + '" data-key="image">' +
            '<label class="btn file-btn small">Enviar imagem<input type="file" accept="image/*" data-upload-object="' + esc(path) + '" data-index="' + index + '" data-key="image"></label>' +
          '</div>' +
          (item.image ? '<img class="image-preview" src="' + esc(item.image) + '" alt="Prévia do projeto">' : '') +
          '<div class="upload-field compact video-upload-field">' +
            '<div><span>Vídeo do projeto</span><small><b>YouTube não listado recomendado.</b> Cole o link; MP4/WebM curto continua como alternativa.</small></div>' +
            '<input type="url" value="' + esc(item.video || '') + '" placeholder="https://youtu.be/SEU_VIDEO" data-object-path="' + esc(path) + '" data-index="' + index + '" data-key="video">' +
            '<div class="media-actions">' +
              '<button class="btn small" type="button" data-preview-object="' + esc(path) + '" data-index="' + index + '" data-key="video">Testar vídeo</button>' +
              '<label class="btn file-btn small">MP4/WebM<input type="file" accept="video/mp4,video/webm,.mp4,.webm" data-upload-object="' + esc(path) + '" data-index="' + index + '" data-key="video"></label>' +
            '</div>' +
          '</div>' +
          (item.video ? '<div class="video-linked"><span>Vídeo configurado</span><small>O botão ▶ aparecerá nesse projeto no site.</small></div>' : '') +
          '</div></details></article>';
      }

      return '';
    }).join('');
  }

  function objectInput(path, index, key, label, value) {
    return '<label><span>' + esc(label) + '</span><input type="text" value="' + esc(value || '') + '" data-object-path="' + esc(path) + '" data-index="' + index + '" data-key="' + esc(key) + '"></label>';
  }

  function objectTextarea(path, index, key, label, value, rows) {
    return '<label><span>' + esc(label) + '</span><textarea rows="' + rows + '" data-object-path="' + esc(path) + '" data-index="' + index + '" data-key="' + esc(key) + '">' + esc(value || '') + '</textarea></label>';
  }

  function onFieldInput(event) {
    if (!config) return;
    const target = event.target;

    if (target.dataset.adminRole && event.type === 'change') {
      changeAdminRole(target.dataset.adminRole, target.value);
      return;
    }

    if (target.dataset.path) {
      const value = target.type === 'checkbox' ? target.checked : target.value;
      setPath(config, target.dataset.path, value);
      if (['showreel.cover', 'about.image'].includes(target.dataset.path)) refreshMediaPreviews();
      markDirty();
      return;
    }

    if (target.dataset.stringPath) {
      const list = getPath(config, target.dataset.stringPath);
      if (Array.isArray(list)) {
        list[Number(target.dataset.index)] = target.value;
        markDirty();
      }
      return;
    }

    if (target.dataset.objectPath) {
      const list = getPath(config, target.dataset.objectPath);
      const item = Array.isArray(list) ? list[Number(target.dataset.index)] : null;
      if (item) {
        item[target.dataset.key] = target.value;
        updateProjectSummary(target.closest('.portfolio-editor'));
        markDirty();
      }
    }
  }

  async function onDynamicClick(event) {
    const shortcut = event.target.closest('[data-open-panel]');
    if (shortcut) {
      const destination = shortcut.dataset.openPanel;
      if (q('.nav-item[data-panel="' + cssEscape(destination) + '"]')) activatePanel(destination);
      return;
    }

    const addString = event.target.closest('[data-add-string]');
    if (addString) {
      const path = addString.dataset.addString;
      let list = getPath(config, path);
      if (!Array.isArray(list)) {
        list = [];
        setPath(config, path, list);
      }
      list.push('');
      renderStringList(q('[data-string-list="' + cssEscape(path) + '"]'));
      markDirty();
      return;
    }

    const removeString = event.target.closest('[data-remove-string]');
    if (removeString) {
      if (!window.confirm('Excluir esta opção do formulário?')) return;
      const list = getPath(config, removeString.dataset.listPath);
      list?.splice(Number(removeString.dataset.index), 1);
      renderStringList(q('[data-string-list="' + cssEscape(removeString.dataset.listPath) + '"]'));
      markDirty();
      return;
    }

    const moveString = event.target.closest('[data-move-string]');
    if (moveString) {
      moveArrayItem(moveString.dataset.listPath, Number(moveString.dataset.index), moveString.dataset.moveString);
      renderStringList(q('[data-string-list="' + cssEscape(moveString.dataset.listPath) + '"]'));
      return;
    }

    const addItem = event.target.closest('[data-add-item]');
    if (addItem) {
      addObjectItem(addItem.dataset.addItem);
      return;
    }

    const removeItem = event.target.closest('[data-remove-item]');
    if (removeItem) {
      const path = removeItem.dataset.listPath;
      if (!window.confirm('Excluir este item? Ele só será removido do site após salvar e publicar.')) return;
      const list = getPath(config, path);
      list?.splice(Number(removeItem.dataset.index), 1);
      renderObjectList(q('[data-object-list="' + cssEscape(path) + '"]'));
      updateStats();
      filterProjectCards();
      markDirty();
      return;
    }

    const moveItem = event.target.closest('[data-move-item]');
    if (moveItem) {
      const path = moveItem.dataset.listPath;
      moveArrayItem(path, Number(moveItem.dataset.index), moveItem.dataset.moveItem);
      renderObjectList(q('[data-object-list="' + cssEscape(path) + '"]'));
      filterProjectCards();
      return;
    }

    const previewPath = event.target.closest('[data-preview-path]');
    if (previewPath) {
      const value = getPath(config, previewPath.dataset.previewPath);
      openMediaPreview(value);
      return;
    }

    const previewObject = event.target.closest('[data-preview-object]');
    if (previewObject) {
      const list = getPath(config, previewObject.dataset.previewObject);
      const item = Array.isArray(list) ? list[Number(previewObject.dataset.index)] : null;
      openMediaPreview(item?.[previewObject.dataset.key]);
      return;
    }

    const adminDelete = event.target.closest('[data-admin-delete]');
    if (adminDelete) {
      await deleteAdmin(adminDelete.dataset.adminDelete);
      return;
    }

    const adminToggle = event.target.closest('[data-admin-toggle]');
    if (adminToggle) {
      await toggleAdmin(adminToggle.dataset.adminToggle, adminToggle.dataset.active !== 'true');
      return;
    }

    const adminRole = event.target.closest('[data-admin-role]');
    if (adminRole) {
      await changeAdminRole(adminRole.dataset.adminRole, adminRole.value);
      return;
    }
  }

  function addObjectItem(path) {
    let list = getPath(config, path);
    if (!Array.isArray(list)) {
      list = [];
      setPath(config, path, list);
    }

    if (path === 'services.items') list.push({ title: 'Novo serviço', description: 'Descreva este serviço.' });
    else if (path === 'portfolio.items') list.push({
      id: String(Date.now()), category: '', title: '', subtitle: '', image: '', video: '', story: ''
    });
    else if (path === 'faq.items') list.push({ question: 'Nova pergunta?', answer: 'Digite a resposta.' });
    else list.push({ title: 'Novo item', text: 'Digite o texto.' });

    renderObjectList(q('[data-object-list="' + cssEscape(path) + '"]'));
    updateStats();
    markDirty();
    if (path === 'portfolio.items') {
      const search = q('#project-search');
      if (search) search.value = '';
      const cards = qa('#project-list .portfolio-editor');
      qa('.project-editor-details').forEach(item => { item.open = false; });
      const latest = cards[cards.length - 1];
      const detail = q('.project-editor-details', latest);
      if (detail) detail.open = true;
      filterProjectCards();
      q('[data-key="title"]', latest)?.focus();
      latest?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function moveArrayItem(path, index, direction) {
    const list = getPath(config, path);
    if (!Array.isArray(list)) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    markDirty();
  }

  function cssEscape(value) {
    return String(value).replace(/"/g, '\\"');
  }

  async function saveConfig() {
    if (!dirty || !config || saving) return;
    if (activeUploads > 0) { showStatus('Aguarde o envio da imagem ou do vídeo antes de publicar.', 'error', 7000); return; }
    const projects = getPath(config, 'portfolio.items') || [];
    const missing = projects.findIndex(item => !String(item.title || '').trim() || !String(item.category || '').trim());
    if (missing !== -1) {
      activatePanel('portfolio');
      const search = q('#project-search');
      if (search) search.value = '';
      filterProjectCards();
      const card = qa('#project-list .portfolio-editor')[missing];
      if (card) { q('.project-editor-details', card).open = true; q('[data-key="' + (!String(projects[missing].title || '').trim() ? 'title' : 'category') + '"]', card)?.focus(); }
      showStatus('Informe nome e categoria do trabalho antes de publicar.', 'error', 8000);
      return;
    }

    const invalidVideos = validateVideoConfig();
    if (invalidVideos.length) {
      showStatus('Corrija o link de vídeo em: ' + invalidVideos.join(', ') + '.', 'error', 8000);
      return;
    }

    saving = true;
    setDirty(true);
    const publishing = deepClone(config);
    saveBtn.disabled = true;
    if (mobileSaveBtn) mobileSaveBtn.disabled = true;
    saveBtn.textContent = 'Publicando…';
    if (mobileSaveBtn) mobileSaveBtn.textContent = 'Publicando…';
    showStatus('Salvando e publicando alterações…', 'info', 0);

    const { data, error } = await client
      .from('stoski_site_config')
      .update({ data: publishing })
      .eq('id', 1)
      .select('data,revision,updated_at,updated_by')
      .single();

    saveBtn.textContent = 'Salvar e publicar';
    if (mobileSaveBtn) mobileSaveBtn.textContent = 'Salvar e publicar';
    saving = false;

    if (error) {
      showStatus('Falha ao salvar: ' + error.message, 'error', 0);
      setDirty(true);
      return;
    }

    const moreChanges = JSON.stringify(config) !== JSON.stringify(publishing);
    savedConfig = deepClone(data.data);
    revision = data.revision;
    if (moreChanges) {
      markDirty();
      showStatus('Publicado! As alterações feitas durante o envio continuam pendentes. Publique novamente para incluí-las.', 'success', 9000);
    } else {
      config = deepClone(data.data);
      renderAll();
      setDirty(false);
      clearLocalDraft();
      showStatus('Publicado com sucesso. Abra Ver página para conferir o resultado.', 'success', 7000);
    }
  }

  async function uploadFile(file, targetPath, objectMeta = null) {
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = ['video/mp4', 'video/webm'].includes(file.type);
    if (!isImage && !isVideo) {
      showStatus('Formato não permitido. Use imagem, MP4 ou WebM.', 'error');
      return;
    }

    const maxBytes = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      showStatus(isVideo ? 'O vídeo deve ter no máximo 50 MB.' : 'A imagem deve ter no máximo 10 MB.', 'error');
      return;
    }

    const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).replace(/[^a-z0-9]/gi, '').toLowerCase();
    const allowedExt = isVideo ? ['mp4','webm'] : ['jpg','jpeg','png','webp','avif'];
    if (!allowedExt.includes(ext)) {
      showStatus('Extensão de arquivo não permitida.', 'error');
      return;
    }

    const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 70) || (isVideo ? 'video' : 'imagem');
    const folder = isVideo ? 'uploads/videos/' : 'uploads/images/';
    const path = folder + Date.now() + '-' + base + '.' + ext;

    activeUploads++;
    setDirty(dirty);
    try {
    showStatus(isVideo ? 'Enviando vídeo…' : 'Enviando imagem…', 'info', 0);
    const { error } = await client.storage.from('stoski-media').upload(path, file, {
      cacheControl: '86400',
      upsert: false,
      contentType: file.type
    });

    if (error) {
      showStatus('Falha no upload: ' + error.message, 'error', 0);
      return;
    }

    const { data } = client.storage.from('stoski-media').getPublicUrl(path);
    const publicUrl = data?.publicUrl;
    if (!publicUrl) {
      showStatus('Upload concluído, mas não foi possível obter a URL.', 'error');
      return;
    }

    if (objectMeta) {
      const list = getPath(config, objectMeta.path);
      const item = list?.[objectMeta.index];
      if (item) item[objectMeta.key] = publicUrl;
      renderObjectList(q('[data-object-list="' + cssEscape(objectMeta.path) + '"]'));
    } else {
      setPath(config, targetPath, publicUrl);
      const input = q('[data-path="' + cssEscape(targetPath) + '"]');
      if (input) input.value = publicUrl;
    }

    markDirty();
    refreshMediaPreviews();
    showStatus((isVideo ? 'Vídeo' : 'Imagem') + ' enviado. Clique em “Salvar e publicar” para aplicar.', 'success');
    } finally {
      activeUploads = Math.max(0, activeUploads - 1);
      setDirty(dirty);
    }
  }

  document.addEventListener('change', async event => {
    const target = event.target;
    if (target.dataset.uploadTarget) {
      await uploadFile(target.files?.[0], target.dataset.uploadTarget);
      target.value = '';
    }
    if (target.dataset.uploadObject) {
      await uploadFile(target.files?.[0], null, {
        path: target.dataset.uploadObject,
        index: Number(target.dataset.index),
        key: target.dataset.key
      });
      target.value = '';
    }
  });

  function normalizeVideoUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return { type: 'none', url: '' };

    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const youtubeHost = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
      const vimeoHost = host === 'vimeo.com' || host.endsWith('.vimeo.com');

      if (youtubeHost) {
        let id = '';
        if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
        else {
          if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
          const parts = url.pathname.split('/').filter(Boolean);
          if (['shorts','embed','live'].includes(parts[0])) id = parts[1] || id;
        }
        if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
          return { type: 'embed', url: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1&rel=0' };
        }
        return { type: 'invalid', url: '' };
      }

      if (vimeoHost) {
        const parts = url.pathname.split('/').filter(Boolean);
        const id = parts.find(part => /^\d+$/.test(part));
        if (id) return { type: 'embed', url: 'https://player.vimeo.com/video/' + encodeURIComponent(id) + '?autoplay=1&playsinline=1&dnt=1' };
        return { type: 'invalid', url: '' };
      }

      if (['http:','https:'].includes(url.protocol)) return { type: 'file', url: url.href };
    } catch (_) {}

    return { type: 'invalid', url: '' };
  }

  function validateVideoConfig() {
    const invalid = [];

    const showreel = getPath(config, 'showreel.video');
    if (showreel && normalizeVideoUrl(showreel).type === 'invalid') invalid.push('Showreel');

    const projects = getPath(config, 'portfolio.items');
    if (Array.isArray(projects)) {
      projects.forEach((item, index) => {
        if (item?.video && normalizeVideoUrl(item.video).type === 'invalid') {
          invalid.push(item.title || ('Projeto ' + (index + 1)));
        }
      });
    }

    return invalid;
  }

  function closeMediaPreview() {
    const dialog = q('#media-preview-dialog');
    const video = q('#admin-video-preview');
    const frame = q('#admin-video-embed');
    if (video) {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      video.load();
      video.hidden = true;
    }
    if (frame) {
      frame.src = 'about:blank';
      frame.hidden = true;
    }
    if (dialog?.open) dialog.close();
  }

  function openMediaPreview(raw) {
    const dialog = q('#media-preview-dialog');
    const video = q('#admin-video-preview');
    const frame = q('#admin-video-embed');
    const error = q('#admin-video-error');
    const parsed = normalizeVideoUrl(raw);

    if (!dialog || !video || !frame || !error) return;

    video.hidden = true;
    frame.hidden = true;
    error.hidden = true;
    error.textContent = '';

    if (parsed.type === 'embed') {
      frame.src = parsed.url;
      frame.hidden = false;
    } else if (parsed.type === 'file') {
      video.src = parsed.url;
      video.hidden = false;
    } else {
      error.textContent = parsed.type === 'none'
        ? 'Cole ou envie um vídeo primeiro.'
        : 'Link de vídeo inválido. Use YouTube, Vimeo ou um link direto de MP4/WebM.';
      error.hidden = false;
    }

    dialog.showModal();
  }

  async function loadAdmins() {
    if (!currentAdmin || currentAdmin.role !== 'owner') return;
    const list = q('#admin-list');
    const { data, error } = await client
      .from('stoski_admins')
      .select('id,user_id,email,name,role,active,created_at')
      .order('created_at', { ascending: true });

    if (error) {
      list.innerHTML = '<p class="empty">Não foi possível carregar administradores.</p>';
      return;
    }

    list.innerHTML = (data || []).map(item =>
      '<article class="admin-row">' +
        '<div class="admin-identity"><strong>' + esc(item.name || 'Administrador') + '</strong><span>' + esc(item.email) + '</span></div>' +
        '<select data-admin-role="' + esc(item.id) + '" ' + (item.user_id === currentUser.id ? 'disabled' : '') + '>' +
          '<option value="editor"' + (item.role === 'editor' ? ' selected' : '') + '>Editor</option>' +
          '<option value="owner"' + (item.role === 'owner' ? ' selected' : '') + '>Proprietário</option>' +
        '</select>' +
        '<button class="btn small" type="button" data-admin-toggle="' + esc(item.id) + '" data-active="' + item.active + '" ' + (item.user_id === currentUser.id ? 'disabled' : '') + '>' +
          (item.active ? 'Desativar' : 'Ativar') +
        '</button>' +
        '<button class="icon-btn danger-icon" type="button" data-admin-delete="' + esc(item.id) + '" ' + (item.user_id === currentUser.id ? 'disabled' : '') + ' aria-label="Excluir">×</button>' +
      '</article>'
    ).join('');
  }

  function openAdminDialog() {
    q('#admin-name-input').value = '';
    q('#admin-email-input').value = '';
    q('#admin-role-input').value = 'editor';
    q('#admin-dialog').showModal();
  }

  async function addAdmin(event) {
    event.preventDefault();
    const name = q('#admin-name-input').value.trim();
    const email = q('#admin-email-input').value.trim().toLowerCase();
    const role = q('#admin-role-input').value;
    if (!email) return;

    const { error } = await client.from('stoski_admins').insert({
      name,
      email,
      role,
      active: true
    });

    if (error) {
      showStatus('Não foi possível adicionar: ' + error.message, 'error');
      return;
    }

    q('#admin-dialog').close();
    await loadAdmins();
    showStatus('Administrador adicionado. Ele pode criar a conta usando esse mesmo e-mail.', 'success', 7000);
  }

  async function deleteAdmin(id) {
    if (!window.confirm('Remover este administrador?')) return;
    const { error } = await client.from('stoski_admins').delete().eq('id', id);
    if (error) showStatus(error.message, 'error');
    else {
      await loadAdmins();
      showStatus('Administrador removido.', 'success');
    }
  }

  async function toggleAdmin(id, active) {
    const { error } = await client.from('stoski_admins').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) showStatus(error.message, 'error');
    else await loadAdmins();
  }

  async function changeAdminRole(id, role) {
    const { error } = await client.from('stoski_admins').update({ role, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) showStatus(error.message, 'error');
    else {
      await loadAdmins();
      showStatus('Permissão atualizada.', 'success');
    }
  }

  function activatePanel(name) {
    qa('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.panel === name));
    qa('.panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panelId === name));
    const active = q('.nav-item[data-panel="' + cssEscape(name) + '"]');
    const moreMenu = active?.closest('.nav-more');
    if (moreMenu) moreMenu.open = true;
    q('#panel-title').textContent = active?.lastChild?.textContent.trim() || active?.textContent.trim() || 'Painel';
    const page = ({ overview:'index.html', portfolio:'portfolio.html', videos:'portfolio.html', services:'servicos.html', faq:'servicos.html', process:'servicos.html', contact:'contato.html', about:'index.html', differentials:'index.html', sections:'index.html' })[name] || 'index.html';
    const previewLink = q('#panel-preview-link');
    if (previewLink) { previewLink.href = page; previewLink.setAttribute('aria-label', 'Abrir página do site correspondente a ' + name); }
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openSidebar() {
    q('#sidebar').classList.add('open');
    q('#sidebar-backdrop').classList.add('show');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    q('#sidebar').classList.remove('open');
    q('#sidebar-backdrop').classList.remove('show');
    document.body.classList.remove('sidebar-open');
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch (_) {
      return value;
    }
  }

  init();
})();
