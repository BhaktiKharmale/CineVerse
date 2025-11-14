export type SeatCategory = "Silver" | "Gold" | "Platinum";

export interface StaticMovie {
  id: string;
  title: string;
  synopsis: string;
  posterUrl: string;
  languages: string[];
  durationMinutes: number;
  certification: string;
}

export interface StaticTheater {
  id: string;
  name: string;
  city: string;
  addressLine: string;
  screens: string[];
}

export interface StaticShowtime {
  id: string;
  movieId: string;
  theaterId: string;
  startTime: string; // HH:mm format
  screen: string;
}

export interface SeatDefinition {
  id: string;
  row: string;
  column: number;
  category: SeatCategory;
  price: number;
}

export interface SeatRowDefinition {
  row: string;
  category: SeatCategory;
  price: number;
  seatNumbers: number[];
}

export interface PricingConfig {
  convenienceFee: number;
  categoryPricing: Record<SeatCategory, number>;
}

export const STATIC_MOVIE: StaticMovie = {
  id: "movie-kgf",
  title: "KGF",
  synopsis: "Rocky rises from the streets to control the underworld empire of Kolar Gold Fields.",
  posterUrl: "/images/KGF%20Chapter%202.jpg",
  languages: ["Kannada", "Hindi", "Telugu"],
  durationMinutes: 156,
  certification: "UA",
};

export const STATIC_THEATER: StaticTheater = {
  id: "theatre-cineverse-plaza",
  name: "CineVerse Plaza",
  city: "Bengaluru",
  addressLine: "MG Road, Bengaluru",
  screens: ["Screen 1", "Screen 2", "Screen 3"],
};

export const STATIC_SHOWTIMES: StaticShowtime[] = [
  {
    id: "showtime-kgf-1100",
    movieId: STATIC_MOVIE.id,
    theaterId: STATIC_THEATER.id,
    startTime: "11:00",
    screen: "Screen 1",
  },
  {
    id: "showtime-kgf-1430",
    movieId: STATIC_MOVIE.id,
    theaterId: STATIC_THEATER.id,
    startTime: "14:30",
    screen: "Screen 2",
  },
  {
    id: "showtime-kgf-1915",
    movieId: STATIC_MOVIE.id,
    theaterId: STATIC_THEATER.id,
    startTime: "19:15",
    screen: "Screen 1",
  },
];

export const SEAT_ROWS: SeatRowDefinition[] = [
  { row: "A", category: "Silver", price: 180, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { row: "B", category: "Silver", price: 180, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { row: "C", category: "Gold", price: 240, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { row: "D", category: "Gold", price: 240, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { row: "E", category: "Platinum", price: 320, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { row: "F", category: "Platinum", price: 320, seatNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
];

export const PREBOOKED_SEATS: Record<string, string[]> = {
  [STATIC_SHOWTIMES[0].id]: ["A3", "A4", "B5", "C6", "C7", "E2", "E3", "F8", "F9", "D1"],
  [STATIC_SHOWTIMES[1].id]: ["A1", "B2", "B3", "C5", "C6", "D4", "D5", "E7", "F3", "F4"],
  [STATIC_SHOWTIMES[2].id]: ["A6", "A7", "B8", "C2", "C3", "D7", "E5", "E6", "F1", "F2"],
};

export const PRICING_CONFIG: PricingConfig = {
  convenienceFee: 20,
  categoryPricing: {
    Silver: 180,
    Gold: 240,
    Platinum: 320,
  },
};

export const BOOKING_DATE = new Date();

export const BOOKING_DATE_LABEL = BOOKING_DATE.toLocaleDateString(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});

export const BOOKING_DATE_ISO = BOOKING_DATE.toISOString().split("T")[0];


