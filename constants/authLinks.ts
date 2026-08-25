const DEFAULT_SNABBB_SIGNUP_URL = 'https://app.snabbb.com/signup';

export const SNABBB_SIGNUP_URL = (() => {
  const configuredUrl = import.meta.env.VITE_SNABBB_SIGNUP_URL?.trim();

  if (!configuredUrl) return DEFAULT_SNABBB_SIGNUP_URL;

  try {
    return new URL(configuredUrl).toString();
  } catch {
    return DEFAULT_SNABBB_SIGNUP_URL;
  }
})();
