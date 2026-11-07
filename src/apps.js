const images = import.meta.glob('../images/*.png', { eager: true, import: 'default' });
const img = (name) => images[`../images/${name}.png`];

export const apps = [
  { id: 'apple-tv', name: 'Apple TV', tagline: 'Apple Originals, movies & shows', url: 'https://tv.apple.com' },
  { id: 'netflix', name: 'Netflix', tagline: 'Movies, series & more', url: 'https://www.netflix.com' },
  { id: 'prime-video', name: 'Prime Video', tagline: 'Movies, shows & live sports', url: 'https://www.primevideo.com' },
  { id: 'disney', name: 'Disney+', tagline: 'Disney, Pixar, Marvel, Star Wars & more', url: 'https://www.disneyplus.com' },
  { id: 'hbo', name: 'HBO Max', tagline: 'HBO series, films & more', url: 'https://www.hbomax.com' },
  { id: 'hulu', name: 'Hulu', tagline: 'Current TV, originals & movies', url: 'https://www.hulu.com' },
  { id: 'youtube', name: 'YouTube', tagline: 'Videos, creators & music', url: 'https://www.youtube.com' },
  { id: 'peacock', name: 'Peacock', tagline: 'Shows, movies & live sports', url: 'https://www.peacocktv.com' },
  { id: 'paramount', name: 'Paramount+', tagline: 'Movies, shows & live sports', url: 'https://www.paramountplus.com' },
  { id: 'crunchyroll', name: 'Crunchyroll', tagline: 'Anime, simulcasts & more', url: 'https://www.crunchyroll.com' },
  { id: 'apple-music', name: 'Apple Music', tagline: 'Songs, albums & playlists', url: 'https://music.apple.com' },
  { id: 'spotify', name: 'Spotify', tagline: 'Music & podcasts', url: 'https://open.spotify.com', bg: '#000' },
].map((app) => ({ ...app, image: img(app.id) }));
