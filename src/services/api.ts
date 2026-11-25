import axios from 'axios';

const ADMIN_TOKEN_KEY = 'sisa_uang_admin_token';
const ACTOR_EMAIL_KEY = 'sisa_uang_actor_email';
const USER_TOKEN_KEY = 'sisa_uang_user_token';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getApiUserToken(): string | null {
  try {
    return localStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiUserToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(USER_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(USER_TOKEN_KEY);
    }
  } catch {
    // Ignore storage error
  }
}

export function getUserAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const userToken = localStorage.getItem(USER_TOKEN_KEY);
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    let actorEmail = localStorage.getItem(ACTOR_EMAIL_KEY);
    if (!actorEmail) {
      const savedUser = localStorage.getItem('sisa_uang_active_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.email) {
          actorEmail = String(parsed.email);
        }
      }
    }
    if (userToken) headers['x-user-token'] = userToken;
    if (adminToken) headers['x-admin-token'] = adminToken;
    if (actorEmail) headers['x-actor-email'] = actorEmail;
  } catch {
    // Ignore storage error
  }
  return headers;
}

apiClient.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  const userToken = localStorage.getItem(USER_TOKEN_KEY);
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
  if (userToken && config.headers) {
    config.headers['x-user-token'] = userToken;
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
    const hadAdminTokenHeader = Boolean(error.config?.headers?.['x-admin-token']);
    const isAdminRoute = url.includes('/admin');

    const isAdminTokenError =
      (isAdminRoute || hadAdminTokenHeader) &&
      (status === 401 ||
        (status === 403 &&
          (isAdminRoute ||
            errorMsg.includes('token') ||
            errorMsg.includes('sesi super admin') ||
            errorMsg.includes('kedaluwarsa') ||
            errorMsg.includes('dicabut'))));

    if (isAdminTokenError && typeof window !== 'undefined') {
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
    } else if (
      status === 401 &&
      !isAdminRoute &&
      !url.includes('/auth/') &&
      typeof window !== 'undefined'
    ) {
      localStorage.removeItem(USER_TOKEN_KEY);
      window.dispatchEvent(
        new CustomEvent('sisauang:user-session-expired', {
          detail: {
            message:
              error.response?.data?.error ||
              'Sesi login Anda telah kedaluwarsa. Silakan masuk kembali.',
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
