-- Seed: alef-bet, first three nikud, existing letter-name recordings, and Dovi.

insert into public.letters (id, key, glyph, name, is_final, base_letter_id, dagesh_glyph) values
  (1,  'alef',        'א', 'אלף',       false, null, null),
  (2,  'bet',         'ב', 'בית',       false, null, 'בּ'),
  (3,  'gimel',       'ג', 'גימל',      false, null, null),
  (4,  'dalet',       'ד', 'דלת',       false, null, null),
  (5,  'he',          'ה', 'הא',        false, null, null),
  (6,  'vav',         'ו', 'וו',        false, null, null),
  (7,  'zayin',       'ז', 'זין',       false, null, null),
  (8,  'chet',        'ח', 'חית',       false, null, null),
  (9,  'tet',         'ט', 'טית',       false, null, null),
  (10, 'yud',         'י', 'יוד',       false, null, null),
  (11, 'kaf',         'כ', 'כף',        false, null, 'כּ'),
  (12, 'kaf_sofit',   'ך', 'כף סופית',  true,  11,   null),
  (13, 'lamed',       'ל', 'למד',       false, null, null),
  (14, 'mem',         'מ', 'מם',        false, null, null),
  (15, 'mem_sofit',   'ם', 'מם סופית',  true,  14,   null),
  (16, 'nun',         'נ', 'נון',       false, null, null),
  (17, 'nun_sofit',   'ן', 'נון סופית', true,  16,   null),
  (18, 'samech',      'ס', 'סמך',       false, null, null),
  (19, 'ayin',        'ע', 'עין',       false, null, null),
  (20, 'pe',          'פ', 'פא',        false, null, 'פּ'),
  (21, 'pe_sofit',    'ף', 'פא סופית',  true,  20,   null),
  (22, 'tsadi',       'צ', 'צדי',       false, null, null),
  (23, 'tsadi_sofit', 'ץ', 'צדי סופית', true,  22,   null),
  (24, 'kuf',         'ק', 'קוף',       false, null, null),
  (25, 'resh',        'ר', 'ריש',       false, null, null),
  (26, 'shin',        'ש', 'שין',       false, null, null),
  (27, 'tav',         'ת', 'תו',        false, null, 'תּ');

insert into public.nikud (id, key, mark, name, sound_ashkenazi, sound_sephardi, sort_order) values
  (1, 'patach', U&'\05B7', 'פתח',  'a', 'a', 1),
  (2, 'hiriq',  U&'\05B4', 'חיריק', 'i', 'i', 2),
  (3, 'kamatz', U&'\05B8', 'קמץ',  'o', 'a', 3);

-- Letter-name recordings that exist today (ץ has no recording yet)
insert into public.recordings (letter_id, nikud_id, audio_path)
select l.id, null, 'letters/' || l.glyph || '.mp3'
from public.letters l
where l.key <> 'tsadi_sofit';

insert into public.users (name, pronunciation) values ('דובי', 'ashkenazi');
