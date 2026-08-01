// Sign-in / sign-up / code-verification screen.
//
// Rendered over the game. Signing in is optional — "Play as guest" is always
// available and keeps the original localStorage behaviour.
import {
  state, isGuest, setGuest, signup, verifyCode, resendCode, login, loginWithGoogle, logout,
} from './session.js';

let root = null;
let resolveGate = null;
let view = 'signin';
let pendingEmail = '';

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) node.append(c);
  return node;
};

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false); // offline or blocked — just hide the button
    document.head.appendChild(s);
  });
}

async function mountGoogleButton(container, onError) {
  if (!state.googleClientId) return;
  const ok = await loadGoogleScript();
  if (!ok || !window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: state.googleClientId,
    callback: async ({ credential }) => {
      try {
        await loginWithGoogle(credential);
        finish();
      } catch (err) {
        onError(err.message);
      }
    },
  });
  window.google.accounts.id.renderButton(container, {
    theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 300,
  });
  container.classList.add('has-google');
}

function finish() {
  close();
  if (resolveGate) {
    resolveGate(state);
    resolveGate = null;
  }
  window.dispatchEvent(new CustomEvent('ld3d:auth-changed'));
}

function close() {
  if (root) root.classList.add('hidden');
}

function field(labelText, props) {
  const input = el('input', { className: 'auth-input', ...props });
  const label = el('label', { className: 'auth-field' }, [
    el('span', { className: 'auth-label', textContent: labelText }),
    input,
  ]);
  return { label, input };
}

function render({ dismissible }) {
  root.innerHTML = '';
  const card = el('div', { className: 'auth-card' });
  const err = el('p', { className: 'auth-error', hidden: true });
  const note = el('p', { className: 'auth-note', hidden: true });
  const showError = (m) => { err.textContent = m; err.hidden = !m; note.hidden = true; };
  const showNote = (m) => { note.textContent = m; note.hidden = !m; err.hidden = true; };

  const busy = (btn, on, idle) => {
    btn.disabled = on;
    btn.textContent = on ? 'Working…' : idle;
  };

  card.append(el('h1', { className: 'auth-title', textContent: 'Lawn Defense 3D' }));

  // ---------------------------------------------------------------- verify
  if (view === 'verify') {
    card.append(el('p', {
      className: 'auth-sub',
      textContent: `Enter the 6-digit code sent to ${pendingEmail}.`,
    }));
    if (!state.emailDelivery) {
      card.append(el('p', {
        className: 'auth-devhint',
        textContent: 'Email is not configured on this server — the code was printed to the server console.',
      }));
    }
    const form = el('form', { className: 'auth-form' });
    const code = field('Verification code', {
      type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code',
      maxLength: 6, placeholder: '000000', required: true, className: 'auth-input auth-code',
    });
    const submit = el('button', { className: 'auth-btn primary', type: 'submit', textContent: 'Verify' });
    form.append(code.label, err, note, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      busy(submit, true, 'Verify');
      try {
        await verifyCode(pendingEmail, code.input.value.trim());
        finish();
      } catch (ex) {
        showError(ex.message);
        busy(submit, false, 'Verify');
      }
    });
    card.append(form);

    const resend = el('button', { className: 'auth-link', type: 'button', textContent: 'Send a new code' });
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      try {
        const r = await resendCode(pendingEmail);
        showNote(r.message || 'A new code is on its way.');
      } catch (ex) {
        showError(ex.message);
      }
      setTimeout(() => { resend.disabled = false; }, 5000);
    });
    const back = el('button', { className: 'auth-link', type: 'button', textContent: 'Use a different email' });
    back.addEventListener('click', () => { view = 'signup'; render({ dismissible }); });
    card.append(el('div', { className: 'auth-links' }, [resend, back]));

    root.append(card);
    setTimeout(() => code.input.focus(), 40);
    return;
  }

  // ---------------------------------------------------------------- sign in / sign up
  const signingUp = view === 'signup';
  card.append(el('p', {
    className: 'auth-sub',
    textContent: signingUp
      ? 'Create an account to keep your progress on any device.'
      : 'Sign in to keep your progress, or play as a guest.',
  }));

  const form = el('form', { className: 'auth-form' });
  const email = field('Email', {
    type: 'email', autocomplete: 'email', required: true, placeholder: 'you@example.com',
  });
  const password = field('Password', {
    type: 'password',
    autocomplete: signingUp ? 'new-password' : 'current-password',
    required: true,
    placeholder: signingUp ? 'At least 8 characters' : '',
  });
  const submit = el('button', {
    className: 'auth-btn primary', type: 'submit',
    textContent: signingUp ? 'Create account' : 'Sign in',
  });
  form.append(email.label, password.label, err, note, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idle = signingUp ? 'Create account' : 'Sign in';
    busy(submit, true, idle);
    try {
      if (signingUp) {
        const r = await signup(email.input.value.trim(), password.input.value);
        pendingEmail = email.input.value.trim();
        view = 'verify';
        render({ dismissible });
        if (r.message) document.querySelector('.auth-note')?.replaceChildren(r.message);
        return;
      }
      await login(email.input.value.trim(), password.input.value);
      finish();
    } catch (ex) {
      if (ex.next === 'verify') {
        pendingEmail = email.input.value.trim();
        view = 'verify';
        render({ dismissible });
        return;
      }
      showError(ex.message);
      busy(submit, false, idle);
    }
  });
  card.append(form);

  if (state.googleClientId) {
    card.append(el('div', { className: 'auth-divider' }, [el('span', { textContent: 'or' })]));
    const gbox = el('div', { className: 'auth-google' });
    card.append(gbox);
    void mountGoogleButton(gbox, showError);
  } else if (state.dev) {
    // Say so rather than hiding it — otherwise the feature looks missing rather
    // than unconfigured. Suppressed in production.
    card.append(el('div', { className: 'auth-divider' }, [el('span', { textContent: 'or' })]));
    card.append(el('p', {
      className: 'auth-devhint',
      textContent: 'Google sign-in is built in but needs a client ID. Set GOOGLE_CLIENT_ID in .env and restart the server to show the button.',
    }));
  }

  const toggle = el('button', {
    className: 'auth-link', type: 'button',
    textContent: signingUp ? 'Already have an account? Sign in' : 'New here? Create an account',
  });
  toggle.addEventListener('click', () => { view = signingUp ? 'signin' : 'signup'; render({ dismissible }); });

  const links = el('div', { className: 'auth-links' }, [toggle]);
  if (dismissible) {
    const guest = el('button', { className: 'auth-link', type: 'button', textContent: 'Play as guest' });
    guest.addEventListener('click', () => { setGuest(true); finish(); });
    links.append(guest);
  } else {
    const cancel = el('button', { className: 'auth-link', type: 'button', textContent: 'Cancel' });
    cancel.addEventListener('click', () => finish());
    links.append(cancel);
  }
  card.append(links);

  if (!state.online) {
    card.append(el('p', {
      className: 'auth-devhint',
      textContent: 'No game server detected — accounts are unavailable, but you can still play as a guest.',
    }));
  } else if (!state.storage) {
    card.append(el('p', {
      className: 'auth-devhint',
      textContent: 'This deployment has no database configured, so accounts cannot be saved. Set DATABASE_URL — see the README. You can still play as a guest.',
    }));
  }

  root.append(card);
  setTimeout(() => email.input.focus(), 40);
}

function ensureRoot() {
  if (root) return root;
  root = document.getElementById('auth-root');
  if (!root) {
    root = el('div', { id: 'auth-root' });
    document.getElementById('app').append(root);
  }
  return root;
}

/**
 * Shown once at boot when the player is neither signed in nor an established
 * guest. Resolves as soon as they pick a side.
 */
export function authGate() {
  if (state.user || isGuest() || !state.online) {
    if (!state.online) setGuest(true);
    return Promise.resolve(state);
  }
  ensureRoot().classList.remove('hidden');
  view = 'signin';
  render({ dismissible: true });
  return new Promise((resolve) => { resolveGate = resolve; });
}

/** Reopened from the menu by someone who started as a guest. */
export function openAuth() {
  if (!state.online) return;
  ensureRoot().classList.remove('hidden');
  view = 'signin';
  render({ dismissible: false });
}

export async function signOut() {
  await logout();
  window.dispatchEvent(new CustomEvent('ld3d:auth-changed'));
}
