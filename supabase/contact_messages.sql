create table if not exists public.contact_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ip_address text,
  name text,
  email text,
  subject text,
  message text,
  user_id uuid references public.users(id)
);

create index if not exists contact_messages_ip_idx on public.contact_messages(ip_address);

-- Optional: Enable RLS so regular users can't read all messages
alter table public.contact_messages enable row level security;
