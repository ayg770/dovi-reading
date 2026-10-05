-- More vowels as optional categories (segol, tsere, holam, kubutz, shuruk).
insert into public.nikud (id, key, mark, name, sound_ashkenazi, sound_sephardi, sort_order) values
  (4, 'segol',  U&'\05B6', 'סגול',  'e',  'e', 4),
  (5, 'tsere',  U&'\05B5', 'צירה',  'ey', 'e', 5),
  (6, 'holam',  U&'\05B9', 'חולם',  'oy', 'o', 6),
  (7, 'kubutz', U&'\05BB', 'קובוץ', 'u',  'u', 7),
  (8, 'shuruk', U&'\05D5\05BC', 'שורוק', 'u', 'u', 8)
on conflict (id) do nothing;
update public.nikud set sound_ashkenazi = 'o', sound_sephardi = 'a' where id = 3;
