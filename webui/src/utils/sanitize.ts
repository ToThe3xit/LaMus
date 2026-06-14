const ALLOWED_AVATAR_ORIGINS = [
  'https://cdn.discordapp.com',
  'https://media.discordapp.net',
];

const AVATAR_FALLBACK = 'https://cdn.discordapp.com/embed/avatars/0.png';

export function sanitizeAvatarSrc(url: string | null | undefined): string {
  if (!url) return AVATAR_FALLBACK;
  try {
    const parsed = new URL(url);
    if (ALLOWED_AVATAR_ORIGINS.some(o => parsed.origin === o)) {
      return url;
    }
  } catch {
    // invalid URL
  }
  return AVATAR_FALLBACK;
}