const STUDENT_EMAIL_DOMAIN =
  process.env.STUDENT_EMAIL_DOMAIN?.trim().toLowerCase() || "unyt.edu.al";

export function buildFallbackStudentEmail(username: string) {
  return `${username.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}
