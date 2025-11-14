/**
 * Poster Mapping Utility
 * Maps movie data to local image paths in /images/
 * All posters must exist in frontend/public/images/
 * Using EXACT filenames as they appear in the directory (with spaces)
 */

// Canonical mapping: movie ID/title → local image filename (EXACT filenames from disk)
const POSTER_MAP: Record<string, string> = {
  // Map by movie ID (preferred) - using exact filenames with spaces
  "1": "Dune Part Two.jpg",
  "2": "Oppenheimer.jpg",
  "3": "Pathaan.jpg",
  "4": "Avatar The Way of Water.jpeg",
  "5": "Jawan.jpeg",
  "6": "The Batman.jpg",
  "7": "RRR.jpeg",
  "8": "Spider Man Across the Spider Verse.jpg",
  "9": "Joker.jpg",
  "10": "KGF Chapter 2.jpg",
};

// Title-based fallback mapping (case-insensitive) - maps to exact filenames
const TITLE_TO_FILENAME: Record<string, string> = {
  "dune: part two": "Dune Part Two.jpg",
  "dune part two": "Dune Part Two.jpg",
  "oppenheimer": "Oppenheimer.jpg",
  "pathaan": "Pathaan.jpg",
  "avatar: the way of water": "Avatar The Way of Water.jpeg",
  "avatar the way of water": "Avatar The Way of Water.jpeg",
  "jawan": "Jawan.jpeg",
  "the batman": "The Batman.jpg",
  "batman": "The Batman.jpg",
  "rrr": "RRR.jpeg",
  "spider-man: across the spider-verse": "Spider Man Across the Spider Verse.jpg",
  "spider man: across the spider verse": "Spider Man Across the Spider Verse.jpg",
  "spider-man across the spider-verse": "Spider Man Across the Spider Verse.jpg",
  "spider man across the spider verse": "Spider Man Across the Spider Verse.jpg",
  "joker": "Joker.jpg",
  "kgf: chapter 2": "KGF Chapter 2.jpg",
  "kgf chapter 2": "KGF Chapter 2.jpg",
  "kgf chapter2": "KGF Chapter 2.jpg",
};

const PLACEHOLDER = "/images/placeholder_poster.svg";

/**
 * Get local poster path for a movie
 * Priority: movie ID → title → placeholder
 */
export function getLocalPosterPath(movieId?: string | number, title?: string): string {
  // Try by ID first
  if (movieId) {
    const idStr = String(movieId);
    if (POSTER_MAP[idStr]) {
      return `/images/${POSTER_MAP[idStr]}`;
    }
  }

  // Try by title (case-insensitive)
  if (title) {
    const normalizedTitle = title.toLowerCase().trim();
    const filename = TITLE_TO_FILENAME[normalizedTitle];
    if (filename) {
      return `/images/${filename}`;
    }
  }

  // Fallback to placeholder
  return PLACEHOLDER;
}

/**
 * Get placeholder path (for onError handlers)
 */
export function getPlaceholderPath(): string {
  return PLACEHOLDER;
}
