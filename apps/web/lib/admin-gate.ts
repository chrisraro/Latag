export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: string | undefined
): boolean {
  if (!email) return false;
  if (!adminEmails) return false;

  const normalizedEmail = email.trim().toLowerCase();
  const emails = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase());

  return emails.includes(normalizedEmail);
}
