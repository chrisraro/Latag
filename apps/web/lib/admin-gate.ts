export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: string | undefined
): boolean {
  if (!email) return false;
  if (!adminEmails) return false;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false; // whitespace-only email never matches
  const emails = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean); // trailing commas must not create an empty-string admin

  return emails.includes(normalizedEmail);
}
