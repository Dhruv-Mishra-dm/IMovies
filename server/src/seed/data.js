// Demo catalogue. Every movie, person and cinema here is FICTIONAL — no real customer data,
// no scraped or copyrighted material. Posters are original SVGs bundled in client/public/posters.
import { buildLayout } from '../domain/seatLayout.js';

// releaseOffsetDays is relative to the day the seed runs, so the demo always has
// "now showing" and "coming soon" titles.
export const movies = [
  {
    slug: 'the-monsoon-cipher',
    title: 'The Monsoon Cipher',
    synopsis:
      'When a retired code-breaker finds a message hidden in the rainfall records of Mumbai, she has seven days to decode it before the last monsoon storm washes the evidence away.',
    genres: ['Thriller', 'Mystery'],
    languages: ['Hindi', 'English'],
    durationMins: 142,
    certification: 'UA 13+',
    releaseOffsetDays: -12,
    director: 'Ira Deshpande',
    cast: ['Meera Kulkarni', 'Arjun Sethi', 'Kabir Nair'],
    trailerUrl: 'https://www.youtube.com/results?search_query=the+monsoon+cipher+trailer',
  },
  {
    slug: 'starlight-over-kochi',
    title: 'Starlight Over Kochi',
    synopsis:
      'A struggling boat-builder and an astronomer stranded by a cancelled flight spend one luminous week restoring an old observatory on the backwaters.',
    genres: ['Romance', 'Drama'],
    languages: ['Malayalam', 'English'],
    durationMins: 128,
    certification: 'U',
    releaseOffsetDays: -20,
    director: 'Thomas Varghese',
    cast: ['Anjali Menon', 'Rohan Pillai'],
  },
  {
    slug: 'velocity-run',
    title: 'Velocity Run',
    synopsis:
      'A courier who never misses a delivery is handed a package that every gang in Delhi wants. She has until sunrise and one tank of fuel.',
    genres: ['Action', 'Thriller'],
    languages: ['Hindi', 'Tamil', 'Telugu'],
    durationMins: 151,
    certification: 'UA 16+',
    releaseOffsetDays: -5,
    director: 'Vikram Rao',
    cast: ['Sana Qureshi', 'Dev Malhotra', 'Farhan Ali'],
  },
  {
    slug: 'paper-kites',
    title: 'Paper Kites',
    synopsis:
      'Three siblings build a kite big enough to carry a wish to their grandmother in Jaipur — and accidentally start the most chaotic festival their town has ever seen.',
    genres: ['Animation', 'Family', 'Comedy'],
    languages: ['Hindi', 'English'],
    durationMins: 104,
    certification: 'U',
    releaseOffsetDays: -30,
    director: 'Nisha Bhatt',
    cast: ['Voice of Aarav Joshi', 'Voice of Pihu Sharma'],
  },
  {
    slug: 'the-last-lighthouse',
    title: 'The Last Lighthouse',
    synopsis:
      'On a fog-bound island off the Konkan coast, the keeper of a decommissioned lighthouse insists ships are still passing in the night.',
    genres: ['Mystery', 'Drama'],
    languages: ['English'],
    durationMins: 118,
    certification: 'UA 7+',
    releaseOffsetDays: -8,
    director: 'Leela Fernandes',
    cast: ['Joseph DSouza', 'Priya Lobo'],
  },
  {
    slug: 'circuit-of-ghosts',
    title: 'Circuit of Ghosts',
    synopsis:
      'A Bengaluru chip designer discovers that the prototype she shipped is answering questions nobody asked it — in her late father’s voice.',
    genres: ['Sci-Fi', 'Thriller'],
    languages: ['English', 'Kannada'],
    durationMins: 136,
    certification: 'UA 13+',
    releaseOffsetDays: -2,
    director: 'Sameer Hegde',
    cast: ['Kavya Rao', 'Nikhil Gowda', 'Elena Brooks'],
  },
  {
    slug: 'masala-mayhem',
    title: 'Masala Mayhem',
    synopsis:
      'Two rival caterers are booked for the same wedding by mistake. Neither will leave. The groom is allergic to everything.',
    genres: ['Comedy', 'Family'],
    languages: ['Hindi'],
    durationMins: 124,
    certification: 'U',
    releaseOffsetDays: -15,
    director: 'Rahul Kapoor',
    cast: ['Neha Gill', 'Sunil Batra', 'Ritu Chawla'],
  },
  {
    slug: 'northern-echoes',
    title: 'Northern Echoes',
    synopsis:
      'A sound recordist hikes to a frozen Ladakh monastery to capture a bell that is said to ring only once a decade.',
    genres: ['Adventure', 'Drama'],
    languages: ['English', 'Hindi'],
    durationMins: 112,
    certification: 'UA 7+',
    releaseOffsetDays: -25,
    director: 'Tenzin Dorje',
    cast: ['Ananya Bose', 'Karma Wangchuk'],
  },
  {
    slug: 'saffron-skies',
    title: 'Saffron Skies',
    synopsis:
      'The untold story of India’s first all-women aerobatics team and the summer they flew over the Thar.',
    genres: ['Drama', 'Sports'],
    languages: ['Hindi', 'English'],
    durationMins: 139,
    certification: 'UA 7+',
    releaseOffsetDays: 18,
    director: 'Ira Deshpande',
    cast: ['Simran Kaur', 'Aditi Rao'],
  },
  {
    slug: 'ironclad-hearts',
    title: 'Ironclad Hearts',
    synopsis: 'A steel-town boxing coach gets one last shot when his estranged daughter asks him to train her.',
    genres: ['Sports', 'Drama'],
    languages: ['Hindi', 'Punjabi'],
    durationMins: 133,
    certification: 'UA 13+',
    releaseOffsetDays: 32,
    director: 'Gurpreet Sandhu',
    cast: ['Jasleen Kaur', 'Manjeet Brar'],
  },
];

/** A DRAFT movie that must never appear in the public catalogue (used to demo admin publishing). */
export const draftMovie = {
  slug: 'untitled-heist-project',
  title: 'Untitled Heist Project',
  synopsis: 'Details to be announced.',
  genres: ['Crime'],
  languages: ['Hindi'],
  durationMins: 130,
  certification: 'UA 13+',
  releaseOffsetDays: 90,
  director: 'TBA',
  cast: [],
};

const standardCategories = [
  { code: 'CLASSIC', name: 'Classic' },
  { code: 'PRIME', name: 'Prime' },
  { code: 'RECLINER', name: 'Recliner' },
];

/** 10 rows × 14 seats with two aisles; back row recliners; first-row aisle seats wheelchair accessible. */
export const largeScreenLayout = buildLayout({
  categories: standardCategories,
  rows: [
    { label: 'A', category: 'CLASSIC', seats: 14, aisleAfter: [3, 11], accessible: [1, 14] },
    { label: 'B', category: 'CLASSIC', seats: 14, aisleAfter: [3, 11] },
    { label: 'C', category: 'CLASSIC', seats: 14, aisleAfter: [3, 11] },
    { label: 'D', category: 'CLASSIC', seats: 14, aisleAfter: [3, 11], disabled: [7] },
    { label: 'E', category: 'PRIME', seats: 14, aisleAfter: [3, 11] },
    { label: 'F', category: 'PRIME', seats: 14, aisleAfter: [3, 11] },
    { label: 'G', category: 'PRIME', seats: 14, aisleAfter: [3, 11] },
    { label: 'H', category: 'PRIME', seats: 14, aisleAfter: [3, 11] },
    { label: 'J', category: 'RECLINER', seats: 8, aisleAfter: [4], offset: 3 },
    { label: 'K', category: 'RECLINER', seats: 8, aisleAfter: [4], offset: 3 },
  ],
});

/** A small premium screen: 6 rows × 10. */
export const smallScreenLayout = buildLayout({
  categories: [
    { code: 'PRIME', name: 'Prime' },
    { code: 'RECLINER', name: 'Recliner' },
  ],
  rows: [
    { label: 'A', category: 'PRIME', seats: 10, aisleAfter: [5], accessible: [1] },
    { label: 'B', category: 'PRIME', seats: 10, aisleAfter: [5] },
    { label: 'C', category: 'PRIME', seats: 10, aisleAfter: [5] },
    { label: 'D', category: 'PRIME', seats: 10, aisleAfter: [5] },
    { label: 'E', category: 'RECLINER', seats: 6, aisleAfter: [3], offset: 2 },
    { label: 'F', category: 'RECLINER', seats: 6, aisleAfter: [3], offset: 2 },
  ],
});

// Base prices in paise (₹1 = 100 paise). Evening shows cost ₹50 more per seat.
export const basePrices = { CLASSIC: 18000, PRIME: 25000, RECLINER: 45000 };
export const EVENING_SURCHARGE = 5000;

export const theatres = [
  {
    slug: 'galaxy-cinemas-bandra',
    name: 'Galaxy Cinemas Bandra',
    city: 'Mumbai',
    address: '14 Hill Road, Bandra West, Mumbai 400050',
    amenities: ['Recliners', 'Wheelchair access', 'Food court', 'Parking'],
    screens: [
      { name: 'Screen 1', format: 'IMAX', layout: largeScreenLayout },
      { name: 'Screen 2', format: '2D', layout: smallScreenLayout },
    ],
  },
  {
    slug: 'harbour-lights-colaba',
    name: 'Harbour Lights Colaba',
    city: 'Mumbai',
    address: '3 Shahid Bhagat Singh Road, Colaba, Mumbai 400005',
    amenities: ['Wheelchair access', 'Café'],
    screens: [{ name: 'Audi A', format: '2D', layout: largeScreenLayout }],
  },
  {
    slug: 'orbit-multiplex-indiranagar',
    name: 'Orbit Multiplex Indiranagar',
    city: 'Bengaluru',
    address: '100 Feet Road, Indiranagar, Bengaluru 560038',
    amenities: ['Recliners', '4DX', 'Parking'],
    screens: [
      { name: 'Screen 1', format: '3D', layout: largeScreenLayout },
      { name: 'Screen 2', format: '2D', layout: smallScreenLayout },
    ],
  },
  {
    slug: 'regal-arcade-connaught-place',
    name: 'Regal Arcade Connaught Place',
    city: 'Delhi',
    address: 'Block A, Connaught Place, New Delhi 110001',
    amenities: ['Heritage building', 'Wheelchair access'],
    screens: [{ name: 'Main Hall', format: '2D', layout: largeScreenLayout }],
  },
];

/** IST start times used for every screen every day. Gaps fit any film ≤ 195 min plus turnaround. */
export const DAILY_SLOTS = ['10:00', '13:30', '17:15', '21:00'];
export const SEED_DAYS = 7;
