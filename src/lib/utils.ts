export function normalizeContact(contact: string): string {
  if (!contact) return '';
  const clean = contact.trim().toLowerCase();
  
  if (clean.includes('@')) {
    return clean;
  }

  // Remove all non-digit characters
  let digits = clean.replace(/\D/g, '');
  
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '254' + digits.slice(1);
  } else if (digits.length === 9) {
    digits = '254' + digits;
  }
  
  return digits || clean;
}

export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ');
}

export function generateDownloadFilename(fullName: string, eventName?: string): string {
  const attendeeName = (fullName || 'ATTENDEE').trim().toUpperCase().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ');
  const cleanEvent = (eventName || 'UTQ ANNIVERSARY').trim().toUpperCase().replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, ' ');
  return `${attendeeName} - ${cleanEvent}.png`;
}

export const STATUS_OPTIONS = [
  "Pastor",
  "Associate Pastor",
  "Reverend",
  "Bishop",
  "Apostle",
  "Prophet/Prophetess",
  "Evangelist",
  "Elder",
  "Deacon/Deaconess",
  "Minister",
  "Missionary",
  "Church Member",
  "Youth Leader",
  "Choir Member",
  "Student",
  "Teacher",
  "Lecturer/Professor",
  "Principal/Head Teacher",
  "School Administrator",
  "CEO/Business Owner",
  "Director/Manager",
  "Entrepreneur",
  "Doctor",
  "Nurse",
  "Other Healthcare Professional",
  "MP/Member of Parliament",
  "Councilor",
  "Government Official",
  "Civil Servant",
  "Community/Traditional Leader",
  "Journalist/Media",
  "Community Member",
  "Guest",
  "Other"
];
