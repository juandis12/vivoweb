const MANDATORY_GENRES = [10751, 10762]; // Familia, Kids
const SAFE_GENRES      = [16, 12, 35];   // Animación, Aventura, Comedia
const BANNED_GENRES    = [18, 27, 80, 53, 10749, 10767, 10763]; // Adulto, Terror, Crimen, Suspenso, Romance, Talk, News

export function filterItemsByProfile(items: any[], isKids: boolean) {
  if (!items || !Array.isArray(items)) return [];
  if (!isKids) return items;

  return items.filter(item => {
    // Genres can be in genre_ids (IDs) or genres (Objects)
    const genres = item.genres || item.genre_ids || [];
    const genreIds: number[] = genres.map((g: any) => typeof g === 'object' ? g.id : g);

    // Rule 1: No genres? Hide (Safe Mode)
    if (genreIds.length === 0) return false;

    // Rule 2: Absolute block if has banned genres
    const hasBanned = genreIds.some(id => BANNED_GENRES.includes(id));
    if (hasBanned) return false;

    // Rule 3: Allow if Family or Kids
    const isFamily = genreIds.some(id => MANDATORY_GENRES.includes(id));
    
    // Rule 4: Regular safe genres (Animation, Adventure, Comedy)
    const isSafeContent = genreIds.some(id => SAFE_GENRES.includes(id));

    return isFamily || isSafeContent;
  });
}
