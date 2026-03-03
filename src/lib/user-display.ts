export function getUserDisplayName(name: string | null | undefined, email: string | null | undefined) {
  const normalizedName = name?.trim();
  if (normalizedName) {
    return normalizedName;
  }

  const normalizedEmail = email?.trim();
  if (normalizedEmail) {
    return normalizedEmail.split("@")[0] || normalizedEmail;
  }

  return "Unknown user";
}
