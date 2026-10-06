import axios from 'axios';

const ADMIN_TOKEN_KEY = 'sisa_uang_admin_token';
const ACTOR_EMAIL_KEY = 'sisa_uang_actor_email';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  let actorEmail = localStorage.getItem(ACTOR_EMAIL_KEY);
  if (!actorEmail) {
    try {
      const savedUser = localStorage.getItem('sisa_uang_active_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.email) {
          actorEmail = String(parsed.email);
        }
      }
    } catch {
      // Ignore parse error
    }
  }
  if (adminToken && config.headers) {
    config.headers['x-admin-token'] = adminToken;
  }
  if (actorEmail && config.headers) {
    config.headers['x-actor-email'] = actorEmail;
  }
  return config;
});

export function setApiAdminContext(email: string | null, token: string | null) {
  if (email) {
    localStorage.setItem(ACTOR_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(ACTOR_EMAIL_KEY);
  }
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}
