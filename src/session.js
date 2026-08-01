// Frontend session state and the progress store.
//
// The game must keep working when there is no backend at all — opened straight
// off a static file server, or with the API down. Every call here degrades to
// guest mode and localStorage rather than throwing.

const STORE_UNLOCKED = 'ld3d.unlocked';
const STORE_GUEST = 'ld3d.guest';

export const state = {
  user: null,          // { email, name, ... } when signed in
  unlocked: 0,
  online: false,       // did the API answer at all
  googleClientId: '',
  emailDelivery: false,
  storage: true,       // API has a working database behind it
  dev: false,          // server is not in production; safe to surface setup hints
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.next = data.next;
    throw err;
  }
  return data;
}

const localUnlocked = () => {
  const n = parseInt(localStorage.getItem(STORE_UNLOCKED) || '0', 10);
  return Number.isNaN(n) ? 0 : n;
};

export const isGuest = () => localStorage.getItem(STORE_GUEST) === '1';
export const setGuest = (on) => {
  if (on) localStorage.setItem(STORE_GUEST, '1');
  else localStorage.removeItem(STORE_GUEST);
};

/** Called once at boot. Resolves even when the backend is missing. */
export async function loadSession() {
  state.unlocked = localUnlocked();

  // /config is the liveness probe: it touches no storage, so it answers even on
  // a half-configured deployment. Only if *this* fails is there truly no API.
  try {
    const config = await api('/config');
    state.online = true;
    state.googleClientId = config.googleClientId || '';
    state.emailDelivery = !!config.emailDelivery;
    state.storage = config.storage !== false;
    state.dev = !!config.dev;
  } catch {
    state.online = false;
    state.user = null;
    return state;
  }

  // A failure here means "not signed in", not "no backend" — don't let a
  // storage problem silently hide the whole sign-in screen.
  try {
    applyAuth(await api('/me'));
  } catch {
    state.user = null;
  }
  return state;
}

/**
 * Adopts the server's view after a sign-in. Local progress is pushed up first so
 * levels beaten as a guest survive making an account.
 */
export function applyAuth(payload) {
  state.user = payload.user || null;
  const serverUnlocked = payload.progress ? payload.progress.unlocked : 0;
  if (state.user) {
    const local = localUnlocked();
    state.unlocked = Math.max(serverUnlocked, local);
    if (local > serverUnlocked) void pushProgress(state.unlocked);
    setGuest(false);
  } else {
    state.unlocked = localUnlocked();
  }
}

async function pushProgress(unlocked) {
  try {
    const res = await api('/progress', { method: 'PUT', body: { unlocked } });
    state.unlocked = res.progress.unlocked;
  } catch {
    /* keep the local value; it syncs on the next win */
  }
}

export function getUnlocked() {
  return state.user ? state.unlocked : localUnlocked();
}

/** Progress only moves forward, mirroring the server-side merge. */
export function setUnlocked(next) {
  const value = Math.max(getUnlocked(), next);
  state.unlocked = value;
  localStorage.setItem(STORE_UNLOCKED, String(value));
  if (state.user) void pushProgress(value);
}

// ---------------------------------------------------------------- auth actions

export const signup = (email, password) => api('/auth/signup', { method: 'POST', body: { email, password } });
export const resendCode = (email) => api('/auth/resend', { method: 'POST', body: { email } });

export async function verifyCode(email, code) {
  const data = await api('/auth/verify', { method: 'POST', body: { email, code } });
  applyAuth(data);
  return data;
}

export async function login(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: { email, password } });
  applyAuth(data);
  return data;
}

export async function loginWithGoogle(credential) {
  const data = await api('/auth/google', { method: 'POST', body: { credential } });
  applyAuth(data);
  return data;
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    /* clearing local state below is what matters */
  }
  state.user = null;
  state.unlocked = localUnlocked();
  setGuest(true);
}
