-- Browsers can't put non-Latin text (e.g. a Hebrew parent code) in a request header,
-- so the app now sends the code base64-encoded (UTF-8) and it is decoded here.
create or replace function public.is_parent()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  header text := current_setting('request.headers', true)::json ->> 'x-parent-code';
  code text;
begin
  if header is null or header = '' then
    return false;
  end if;
  begin
    code := convert_from(decode(header, 'base64'), 'UTF8');
  exception when others then
    return false;
  end;
  return exists (
    select 1 from app_private.parent_pin p
    where p.pin_hash = extensions.crypt(code, p.pin_hash)
  );
end;
$$;
