/**
 * Returns ordinal form of a number for the given locale.
 * Used for "This is your 4th story" type messages.
 */
export function getOrdinal(count: number, locale: string): string {
  const n = Math.floor(count);
  const lang = locale.split('-')[0] || locale;

  switch (lang) {
    case 'uk':
      if (n === 1) return '1-ша';
      if (n === 2) return '2-га';
      if (n === 3) return '3-тя';
      return `${n}-та`;
    case 'ru':
      return `${n}-я`;
    case 'en':
      if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
      if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
      if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
      return `${n}th`;
    case 'es':
      return `${n}.ª`;
    case 'fr':
      if (n === 1) return '1ᵉʳ';
      return `${n}ᵉ`;
    case 'de':
      return `${n}.`;
    default:
      return `${n}`;
  }
}
