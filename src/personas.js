export const DEFAULT_COLOR = {
  accent: '#1ed760', accent2: '#1db954',
  dim: 'rgba(30,215,96,0.14)', glow: 'rgba(30,215,96,0.35)',
};

export const PERSONA_PALETTE = [
  { accent: '#3b82f6', accent2: '#2563eb', dim: 'rgba(59,130,246,0.14)', glow: 'rgba(59,130,246,0.35)' }, // blue
  { accent: '#a855f7', accent2: '#9333ea', dim: 'rgba(168,85,247,0.14)', glow: 'rgba(168,85,247,0.35)' }, // purple
  { accent: '#f97316', accent2: '#ea580c', dim: 'rgba(249,115,22,0.14)',  glow: 'rgba(249,115,22,0.35)'  }, // orange
  { accent: '#ec4899', accent2: '#db2777', dim: 'rgba(236,72,153,0.14)',  glow: 'rgba(236,72,153,0.35)'  }, // pink
  { accent: '#14b8a6', accent2: '#0d9488', dim: 'rgba(20,184,166,0.14)',  glow: 'rgba(20,184,166,0.35)'  }, // teal
  { accent: '#f59e0b', accent2: '#d97706', dim: 'rgba(245,158,11,0.14)',  glow: 'rgba(245,158,11,0.35)'  }, // amber
  { accent: '#6366f1', accent2: '#4f46e5', dim: 'rgba(99,102,241,0.14)',  glow: 'rgba(99,102,241,0.35)'  }, // indigo
];

export function getPersonaColor(persona, allPersonas) {
  if (!persona || persona.is_default) return DEFAULT_COLOR;
  const idx = allPersonas.filter(p => !p.is_default).findIndex(p => p.id === persona.id);
  return PERSONA_PALETTE[Math.max(idx, 0) % PERSONA_PALETTE.length];
}

export function applyPersonaTheme(persona, allPersonas) {
  const color = getPersonaColor(persona, allPersonas);
  const root = document.documentElement;
  root.style.setProperty('--accent',     color.accent);
  root.style.setProperty('--accent-2',   color.accent2);
  root.style.setProperty('--accent-dim', color.dim);
  root.style.setProperty('--accent-glow',color.glow);
}
