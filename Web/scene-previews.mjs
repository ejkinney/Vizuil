// Small, self-contained illustrations of each visual for the scene chooser.
const frame = (background, content) => `<svg viewBox="0 0 160 90" role="presentation" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="90" fill="${background}"/>${content}</svg>`;

const blocks = (x, y, count, color, size = 12) => Array.from({ length: count }, (_, i) =>
  `<rect x="${x + i * (size + 1)}" y="${y}" width="${size}" height="${size}" rx="2" fill="${color}"/>`).join('');

export const scenePreviews = {
  'stick-dancer': frame('#17102b', `
    <circle cx="80" cy="39" r="32" fill="#bc4ad6" opacity=".19"/>
    <path d="M0 70H160M0 78H160M0 86H160M24 90 72 60M136 90 88 60" stroke="#a255c8" opacity=".45"/>
    <circle cx="80" cy="23" r="7" fill="#ffe6a9"/>
    <path d="m80 30-3 25m0-15-19 9m19-9 18 6M77 55 58 69m19-14 21 9" fill="none" stroke="#ffe6a9" stroke-width="5" stroke-linecap="round"/>
    <path d="M12 26h11v28H12m125-34h11v34h-11" fill="#f7a8d9" opacity=".65"/>`),
  'block-party': frame('#1d1635', `
    <path d="M0 77h160" stroke="#c48cfa" stroke-width="3"/>
    ${blocks(27, 65, 8, '#7e6fdb')}${blocks(40, 52, 6, '#c666d9')}${blocks(53, 39, 4, '#edbb63')}${blocks(66, 26, 2, '#71d9cd')}
    <circle cx="73" cy="18" r="8" fill="#ffcd77"/><circle cx="72" cy="16" r="1.5"/><circle cx="77" cy="16" r="1.5"/>
    <path d="M70 21q5 4 9 0" fill="none" stroke="#674b65" stroke-width="1.5"/>`),
  'tidal-garden': frame('#061923', `
    <path d="M0 69q24-12 48 0t52 1 60-8v28H0" fill="#13535a"/>
    <path d="M18 90q-8-21 3-40M30 90q15-24 2-42M118 90q-4-18 11-40M141 90q-14-23-5-39" fill="none" stroke="#60b99b" stroke-width="5" stroke-linecap="round"/>
    <path d="M48 42q15-17 34-2l9 5-9 5q-19 14-34-3l-13 4 4-9-4-7z" fill="#80d6c4"/>
    <circle cx="76" cy="42" r="2" fill="#063a46"/><circle cx="105" cy="23" r="3" fill="none" stroke="#7bd9dc"/><circle cx="113" cy="13" r="2" fill="none" stroke="#7bd9dc"/>`),
  'signal-swarm': frame('#0b1731', `
    <path d="M0 12h160M0 30h160M0 48h160M0 66h160M20 0v90M52 0v90M84 0v90M116 0v90M148 0v90" stroke="#456888" opacity=".25"/>
    <path d="m80 68-13 12 13-4 13 4z" fill="#85e9eb"/>
    <path d="m32 20-7 8 7-2 7 2zm32-8-7 8 7-2 7 2zm32 8-7 8 7-2 7 2zm32-8-7 8 7-2 7 2z" fill="#e990ba"/>
    <path d="M72 57V42m8 18V32m8 25V47" stroke="#85e9eb" stroke-width="2"/><circle cx="80" cy="27" r="3" fill="#f5c890"/>`),
  'beat-stack': frame('#20182f', `
    <rect x="38" y="8" width="81" height="80" rx="5" fill="#141320" stroke="#61567c"/>
    ${blocks(49, 68, 5, '#a45fe0', 11)}<rect x="62" y="56" width="11" height="11" rx="2" fill="#e8b964"/><rect x="74" y="56" width="11" height="11" rx="2" fill="#e8b964"/><rect x="74" y="44" width="11" height="11" rx="2" fill="#e8b964"/>
    <rect x="86" y="31" width="11" height="11" rx="2" fill="#79d6ce"/><rect x="86" y="43" width="11" height="11" rx="2" fill="#79d6ce"/><rect x="98" y="43" width="11" height="11" rx="2" fill="#79d6ce"/>
    <circle cx="24" cy="43" r="5" fill="#f5d5a7"/><path d="m24 48 2 15m-2-9-9 5m11-5 8 4m-8 5-7 11m7-11 10 10" stroke="#f5d5a7" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  'block-brawl': frame('#160e2b', `
    <path d="m53 41 5-10 9-4 8 2 5 9-4 14-5 4-1 12-7 11-4-2 5-14-5-10-6 13-5 1 5-18zm56-6-6-9-9-3-8 3-5 9 4 13 5 5 1 12 7 12 4-2-5-15 5-9 6 12 5 1-5-17z" fill="#f4ff63"/>
    <circle cx="67" cy="20" r="7" fill="#f4ff63"/><circle cx="96" cy="20" r="7" fill="#ff69bd"/>
    <path d="m82 40-5 12-6 5-1 12-7 11-4-2 5-14-5-10-6 13-5 1 5-18m32-21 5 12 6 5 1 12 7 12 4-2-5-15 5-9 6 12 5 1-5-17" stroke="#ff69bd" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
  'signal-desk': frame('#101c22', `
    <path d="M0 72h160v18H0" fill="#162a2b"/><path d="M0 73h160" stroke="#729789"/>
    <rect x="11" y="17" width="42" height="37" rx="4" fill="#263a36" stroke="#80bd9e"/><rect x="59" y="11" width="43" height="41" rx="4" fill="#263a36" stroke="#80bd9e"/><rect x="108" y="19" width="41" height="36" rx="4" fill="#263a36" stroke="#80bd9e"/>
    <path d="M16 40q8-18 14 0t18-5M64 38l7-9 6 6 7-12 12 13m17 2 7-7 7 5 9-10 5 8" fill="none" stroke="#a7e0ae" stroke-width="2"/>
    <circle cx="80" cy="66" r="8" fill="#c29d7d"/><path d="M68 89V75q12-6 24 0v14" fill="#687d72"/><path d="m68 78-17-13m41 13 17-13" stroke="#c29d7d" stroke-width="5" stroke-linecap="round"/>`),
};
