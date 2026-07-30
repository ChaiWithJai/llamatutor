"use client";

export function identityRequestHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  if (typeof document === "undefined") return headers;
  const tokenPart = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nf_jwt="));
  if (!tokenPart) return headers;

  const encodedToken = tokenPart.slice("nf_jwt=".length);
  let token = encodedToken;
  try {
    token = decodeURIComponent(encodedToken);
  } catch {
    // A malformed cookie will fail validation at the Identity boundary.
  }

  return { ...headers, Authorization: `Bearer ${token}` };
}
