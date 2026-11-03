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

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errorMsg = String(error.response?.data?.error || '').toLowerCase();
    const url = String(error.config?.url || '');

    const isTokenError =
      status === 401 ||
      (status === 403 &&
        (url.includes('/admin') ||
          errorMsg.includes('token') ||
          errorMsg.includes('sesi super admin') ||
          errorMsg.includes('kedaluwarsa') ||
          errorMsg.includes('dicabut')));

    if (isTokenError && typeof window !== 'undefined') {
      const currentToken = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (currentToken) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.setItem('sisa_uang_otp_verified', 'false');
      }

      window.dispatchEvent(
        new CustomEvent('sisauang:admin-session-expired', {
          detail: {
            message:
              error.response?.data?.error ||
              'Sesi Super Admin telah kedaluwarsa. Silakan masuk kembali.',
            status,
          },
        })
      );
    }
    return Promise.reject(error);
  }
);

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
