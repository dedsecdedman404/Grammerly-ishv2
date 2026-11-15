// Grammerly-ish app page.
// Login and the rewrite itself are checked by the server (/api/...). Nothing
// here can grant access: the view switching below only changes what is shown.

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const el = {
    account: $('account'),
    accountName: $('account-name'),
    logoutBtn: $('logout-btn'),
    loginForm: $('login-form'),
    username: $('username-input'),
    password: $('password-input'),
    loginError: $('login-error'),
    loginSubmit: $('login-submit'),
    input: $('input-text'),
    counter: $('counter'),
    wordCount: $('word-count'),
    sampleBtn: $('sample-btn'),
    clearBtn: $('clear-btn'),
    humaniseBtn: $('humanise-btn'),
    copyBtn: $('copy-btn'),
    recheckBtn: $('recheck-btn'),
    outEmpty: $('output-empty'),
    outLoading: $('output-loading'),
    outText: $('output-text'),
    outError: $('output-error'),
    toast: $('toast'),
  };

  const SAMPLE_TEXT =
    'Furthermore, it is important to note that social media has significantly impacted the way students communicate. ' +
    'Moreover, it plays a crucial role in shaping modern education, and it is evident that its influence will continue to grow in the coming years.';

  const state = { max: 2000, busy: false, result: '' };

  // ---------- views ----------
  function setView(view) {
    document.body.dataset.view = view;
    el.account.hidden = view !== 'tool';
  }

  function showLogin(message) {
    setView('login');
    if (message) showLoginError(message);
    else el.loginError.hidden = true;
    el.password.value = '';
    (el.username.value ? el.password : el.username).focus();
  }

  function showTool(user, max) {
    state.max = Number(max) > 0 ? Number(max) : state.max;
    el.accountName.textContent = user;
    el.loginError.hidden = true;
    setView('tool');
    updateCounter();
  }

  function showLoginError(message) {
    el.loginError.textContent = message;
    el.loginError.hidden = false;
  }

  // ---------- output states ----------
  function setOutput(mode, message) {
    el.outEmpty.hidden = mode !== 'empty';
    el.outLoading.hidden = mode !== 'loading';
    el.outText.hidden = mode !== 'text';
    el.outError.hidden = mode !== 'error';
    if (mode === 'error') el.outError.textContent = message;
    const hasResult = mode === 'text';
    el.copyBtn.disabled = !hasResult;
    el.recheckBtn.setAttribute('aria-disabled', hasResult ? 'false' : 'true');
    if (!hasResult) el.wordCount.textContent = '';
  }

  // ---------- counter + button state ----------
  function textLength() {
    return el.input.value.trim().length;
  }

  function updateCounter() {
    const len = textLength();
    el.counter.textContent = `${len.toLocaleString('en-GB')} / ${state.max.toLocaleString('en-GB')}`;
    el.counter.classList.toggle('is-over', len > state.max);
    el.humaniseBtn.disabled = state.busy || len === 0 || len > state.max;
  }

  function wordsIn(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  // ---------- helpers ----------
  let toastTimer;
  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  function apiMessage(code) {
    switch (code) {
      case 'EMPTY_TEXT': return 'Add some text first.';
      case 'TEXT_TOO_LONG': return `That's over the ${state.max.toLocaleString('en-GB')} character limit. Split it into shorter sections.`;
      case 'UPSTREAM_TIMEOUT': return 'The rewriting service took too long. Try again.';
      case 'DATA_PARSE_FAILURE': return "We couldn't read the result. Try again.";
      case 'NOT_CONFIGURED': return "The server isn't set up yet. Tell the site owner.";
      case 'UPSTREAM_ERROR':
      default: return "The rewriting service isn't responding. Try again in a minute.";
    }
  }

  // ---------- login ----------
  let loginBusy = false;
  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBusy) return;

    const username = el.username.value.trim();
    const password = el.password.value;
    if (!username || !password) {
      showLoginError('Enter your username and password.');
      return;
    }

    loginBusy = true;
    el.loginSubmit.disabled = true;
    el.loginSubmit.classList.add('is-busy');
    el.loginError.hidden = true;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        el.password.value = '';
        await enterTool();
      } else if (res.status === 429) {
        showLoginError('Too many attempts. Wait 15 minutes, then try again.');
      } else if (res.status === 500) {
        showLoginError("The server isn't set up yet. Tell the site owner.");
      } else {
        showLoginError('That username or password is incorrect.');
        el.password.value = '';
        el.password.focus();
      }
    } catch (_) {
      showLoginError('No connection. Check your internet and try again.');
    } finally {
      loginBusy = false;
      el.loginSubmit.disabled = false;
      el.loginSubmit.classList.remove('is-busy');
    }
  });

  // Ask the server who we are, then show the tool. Falls back to the login view.
  async function enterTool() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) { showLogin(); return; }
      const me = await res.json();
      showTool(me.user, me.maxChars);
      el.input.focus();
    } catch (_) {
      showLogin();
    }
  }

  el.logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) { /* cookie expires by itself anyway */ }
    el.input.value = '';
    state.result = '';
    el.outText.textContent = '';
    setOutput('empty');
    el.username.value = '';
    showLogin();
  });

  // ---------- editor ----------
  el.input.addEventListener('input', updateCounter);

  el.input.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!el.humaniseBtn.disabled) humanise();
    }
  });

  el.sampleBtn.addEventListener('click', () => {
    el.input.value = SAMPLE_TEXT;
    updateCounter();
    el.input.focus();
  });

  el.clearBtn.addEventListener('click', () => {
    el.input.value = '';
    state.result = '';
    el.outText.textContent = '';
    setOutput('empty');
    updateCounter();
    el.input.focus();
  });

  el.copyBtn.addEventListener('click', async () => {
    if (!state.result) return;
    toast((await copyText(state.result)) ? 'Copied.' : "Couldn't copy. Select the text and copy it manually.");
  });

  // The link itself opens ZeroGPT in a new tab; we only copy the text alongside it.
  el.recheckBtn.addEventListener('click', (e) => {
    if (el.recheckBtn.getAttribute('aria-disabled') === 'true' || !state.result) {
      e.preventDefault();
      return;
    }
    copyText(state.result).then((ok) => {
      toast(ok ? 'Copied. Paste it into ZeroGPT to check.' : 'ZeroGPT opened. Copy your text from the box and paste it there.');
    });
  });

  el.humaniseBtn.addEventListener('click', humanise);

  async function humanise() {
    const text = el.input.value.trim();
    if (!text || text.length > state.max || state.busy) return;

    state.busy = true;
    el.humaniseBtn.disabled = true;
    el.humaniseBtn.classList.add('is-busy');
    el.humaniseBtn.textContent = 'Working';
    setOutput('loading');

    try {
      const res = await fetch('/api/humanise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ text }),
      });

      if (res.status === 401) {
        setOutput('empty');
        showLogin('Your session expired. Log in again. Your draft is still here.');
        return;
      }

      let data = null;
      try { data = await res.json(); } catch (_) { /* handled below */ }

      if (!res.ok || !data || !data.text) {
        setOutput('error', apiMessage(data && data.error));
        return;
      }

      state.result = data.text;
      el.outText.textContent = data.text;
      setOutput('text');
      el.wordCount.textContent = `${wordsIn(data.text).toLocaleString('en-GB')} words`;
    } catch (_) {
      setOutput('error', 'No connection. Check your internet and try again.');
    } finally {
      state.busy = false;
      el.humaniseBtn.classList.remove('is-busy');
      el.humaniseBtn.textContent = 'Humanise';
      updateCounter();
    }
  }

  // ---------- start ----------
  setOutput('empty');
  enterTool();
})();
