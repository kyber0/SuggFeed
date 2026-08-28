/**
 * Returns the anonymous user token from localStorage.
 * Creates one if it doesn't exist yet.
 */
export function getAnonToken(): string {
  if (typeof window === "undefined") return "";
  const key = "cv_anon_token";
  let token = localStorage.getItem(key);
  if (!token) {
    token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    localStorage.setItem(key, token);
  }
  return token;
}
