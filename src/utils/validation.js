export function throwIfMissing(obj, requiredProps) {
  const missing = [];
  for (const prop of requiredProps) {
    if (!(prop in obj)) {
      missing.push(prop);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function isMoreThan5MinutesAgo(dateString, currentDate = new Date()) {
  const date = new Date(dateString);
  const diffInMinutes = (currentDate - date) / (1000 * 60);
  return diffInMinutes > 5;
} 