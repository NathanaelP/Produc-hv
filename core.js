export const DEFAULT_CATEGORIES = [
  ['produce', 'Produce', ['Tomatoes','Onion','Bell Peppers','Veggie Trays','Romaine','Eggs','Diced Tomato','Diced Green Onion','Cucumbers','Blend','Shred','Spinach']],
  ['prepared', 'Prepared', ['Grilled Chicken','Bold','Caesar','Turkey Cobb','Chef','Jerk Turkey','Caesar Wrap','Buff Wrap','Chipotle','Cransational','Pitches','FireSmith Hummus','Antipasta','Strawberry','Mediterranean','Southern','Greek','Wild Salmon','Indian Style','SW Chicken Tender','Salmon','Cajun Shrimp','SW Wrap','Veggie Wrap']],
  ['hv', 'HV', ['Boats','Salad','Barns','Oil','Breading','Pickles','Banana Peppers','Jalapenos','Olives']]
].map(([id, name, items]) => ({id, name, items: items.map((name, i) => ({id: `${id}-${i}`, name}))}));

export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function makeSheet(categories = DEFAULT_CATEGORIES) {
  return {id: crypto.randomUUID(), date: localDate(), categories: structuredClone(categories), counts: {}, updated: new Date().toISOString()};
}
export function parseCount(value) {
  if (value.trim() === '') return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,3})?$/.test(normalized)) throw new Error('Use a positive number or zero, with up to 3 decimal places.');
  const number = Number(normalized);
  if (!Number.isFinite(number) || number > 999999) throw new Error('Enter a count between 0 and 999,999.');
  return number;
}
export const itemsOf = sheet => sheet.categories.flatMap(c => c.items);
export const isFilled = (sheet, id) => typeof sheet.counts[id] === 'number';
export const filledCount = sheet => itemsOf(sheet).filter(i => isFilled(sheet, i.id)).length;
export function textSummary(sheet) {
  const lines = [`Produce & HV · ${sheet.date}`];
  for (const c of sheet.categories) {
    const filled = c.items.filter(i => isFilled(sheet, i.id));
    if (filled.length) lines.push('', c.name.toUpperCase(), ...filled.map(i => `${i.name}: ${sheet.counts[i.id]}`));
  }
  return lines.join('\n');
}
export function csvSummary(sheet) {
  // Prevent spreadsheet formula interpretation of editable names.
  const quote = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return '\uFEFF' + [['Date','Category','Item','Count'], ...sheet.categories.flatMap(c => c.items.map(i => [sheet.date,c.name,i.name,isFilled(sheet,i.id) ? sheet.counts[i.id] : '']))].map(row => row.map(quote).join(',')).join('\r\n');
}
export function validateBackup(value) {
  const fail = () => {throw new Error('This is not a valid Produce & HV backup.');};
  const label = s => typeof s === 'string' && s.trim().length > 0 && s.length <= 120;
  const identifier = s => typeof s === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(s);
  if (!value || value.version !== 1 || !Array.isArray(value.sheets) || !value.sheets.length || value.sheets.length > 2000) fail();
  const sheetIds = new Set();
  for (const s of value.sheets) {
    if (!identifier(s.id) || sheetIds.has(s.id)) fail();
    sheetIds.add(s.id);
    if (typeof s.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isFinite(Date.parse(s.date)) || new Date(s.date).toISOString().slice(0,10) !== s.date) fail();
    if (typeof s.updated !== 'string' || !Number.isFinite(Date.parse(s.updated)) || !Array.isArray(s.categories) || !s.categories.length || s.categories.length > 30) fail();
    const ids = new Set(), cats = new Set();
    for (const c of s.categories) {
      if (!identifier(c.id) || cats.has(c.id) || !label(c.name) || !Array.isArray(c.items) || c.items.length > 500) fail();
      cats.add(c.id);
      for (const i of c.items) {
        if (!identifier(i.id) || ids.has(i.id) || !label(i.name)) fail();
        ids.add(i.id);
      }
    }
    if (!s.counts || typeof s.counts !== 'object' || Array.isArray(s.counts)) fail();
    for (const [id, n] of Object.entries(s.counts)) {
      if (!ids.has(id) || typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 999999 || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.000001) fail();
    }
  }
  if (!sheetIds.has(value.activeId)) fail();
  // Keep only known fields; no executable content or arbitrary properties.
  return {version: 1, activeId: value.activeId, sheets: value.sheets.map(s => ({id:s.id,date:s.date,updated:s.updated,categories:s.categories.map(c => ({id:c.id,name:c.name,items:c.items.map(i => ({id:i.id,name:i.name}))})),counts:{...s.counts}}))};
}
