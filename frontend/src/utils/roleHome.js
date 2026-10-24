// Where a user lands after logging in. Technicians go straight to their job list;
// everyone else (customers and the admin) lands on the home page as before.
export function homeFor(user) {
  if (!user) return "/login";
  if (user.needsPhone) return "/complete-profile";
  if (user.role === "technician") return "/technician";
  return "/";
}