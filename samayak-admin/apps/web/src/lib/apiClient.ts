import axios from 'axios';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Attach JWT token from localStorage
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('samayak_token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    config.headers['X-Correlation-ID'] = Math.random().toString(36).slice(2);
  }
  return config;
});

// Handle 401 globally
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('samayak_token');
      localStorage.removeItem('samayak_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
