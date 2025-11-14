export interface Movie {
  id: number;
  title: string;
  poster?: string;
  poster_url?: string;
  backdrop_url?: string;
  tags?: string;
  genre?: string;
  genres?: string[];
  rating?: number | string;
  language?: string;
  languages?: string[];
  releaseDate?: string;
  release_date?: string;
  runtime?: string | number;
  duration?: string | number;
  synopsis?: string;
  description?: string;
  trailer?: string;
  trailer_url?: string;
  promoted?: boolean;
  is_new?: boolean;
  format?: string;
  pricePerSeat?: number;
  location?: string;
}

export interface Cinema {
  id: number;
  name: string;
  address?: string | null;
  location?: string | null;
  city?: string;
  distanceKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  facilities?: string[];
}

export interface Showtime {
  id: number;
  movie_id?: number;
  theatre_id?: number;
  cinema_id?: number;
  starts_at?: string | null;
  start_time?: string | null;
  time_label?: string;
  price?: number | null;
  is_sold_out?: boolean;
  available_seats?: number | null;
}

export interface Offer {
  id: number | string;
  title: string;
  description?: string;
  subtitle?: string;
  valid_till?: string;
  banner_url?: string;
  image_url?: string;
  image?: string;
  partner_logo?: string;
  partnerLogo?: string;
  cta_url?: string;
  link_url?: string;
  url?: string;
}

export interface Seat {
  id: string;
  row?: string;
  number?: number;
  status: "available" | "booked" | "locked" | "selected";
  locked_by?: string | null;
}

export interface BookingSummary {
  id?: string | number;
  userId?: string;
  movieId?: number;
  seats?: Array<string | number>;
  total?: number;
  date?: string;
  time?: string;
  paymentMethod?: string;
}

export interface User {
  id: string | number;
  name: string;
  email: string;
  phone?: string;
  token?: string;
  avatar?: string;
}
