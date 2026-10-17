-- In the Psalms the divine name is written as it is said: הַשֵּׁם.
update public.library_words
set text = replace(replace(replace(replace(text, 'לַיְיָ', 'לַשֵּׁם'), 'בַּיְיָ', 'בַּשֵּׁם'), 'וַיְיָ', 'וְהַשֵּׁם'), 'יְיָ', 'הַשֵּׁם')
where text like '%יְיָ%';
update public.words
set text = replace(replace(replace(replace(text, 'לַיְיָ', 'לַשֵּׁם'), 'בַּיְיָ', 'בַּשֵּׁם'), 'וַיְיָ', 'וְהַשֵּׁם'), 'יְיָ', 'הַשֵּׁם')
where text like '%יְיָ%' and group_id in (select id from public.word_groups where library_id is not null);
update public.words set plain_text = regexp_replace(text, '[\u0591-\u05C7]', '', 'g')
where group_id in (select id from public.word_groups where library_id is not null);
