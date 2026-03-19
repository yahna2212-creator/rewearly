create extension if not exists "pgcrypto";

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yahna2212@gmail.com';
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade
);

alter table public.profiles add column if not exists name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles
set
  name = coalesce(name, 'Rewearly User'),
  email = coalesce(email, ''),
  phone = coalesce(phone, 'Pending'),
  address = coalesce(address, 'Pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.profiles alter column name set default 'Rewearly User';
alter table public.profiles alter column email set default '';
alter table public.profiles alter column phone set default 'Pending';
alter table public.profiles alter column address set default 'Pending';
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();

alter table public.profiles alter column name set not null;
alter table public.profiles alter column email set not null;
alter table public.profiles alter column phone set not null;
alter table public.profiles alter column address set not null;
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_email_key'
  ) then
    alter table public.profiles add constraint profiles_email_key unique (email);
  end if;
end
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid()
);

alter table public.products add column if not exists title text;
alter table public.products add column if not exists description text;
alter table public.products add column if not exists category text;
alter table public.products add column if not exists images text[] default '{}';
alter table public.products add column if not exists requested_price numeric(10,2) default 0;
alter table public.products add column if not exists final_price numeric(10,2) default 0;
alter table public.products add column if not exists seller_payout numeric(10,2) default 0;
alter table public.products add column if not exists royalty_percent numeric(5,2) default 0;
alter table public.products add column if not exists ownership_type text default 'marketplace';
alter table public.products add column if not exists approved boolean default false;
alter table public.products add column if not exists active boolean default true;
alter table public.products add column if not exists condition text default 'excellent';
alter table public.products add column if not exists rejection_reason text;
alter table public.products add column if not exists seller_id uuid references public.profiles(id) on delete set null;
alter table public.products add column if not exists total_rentals integer default 0;
alter table public.products add column if not exists max_rentals integer default 12;
alter table public.products add column if not exists damage_state text default 'active';
alter table public.products add column if not exists created_at timestamptz default now();
alter table public.products add column if not exists updated_at timestamptz default now();

update public.products
set
  title = coalesce(title, 'Untitled Product'),
  description = coalesce(description, ''),
  category = coalesce(category, 'Uncategorized'),
  images = coalesce(images, '{}'),
  requested_price = coalesce(requested_price, 0),
  final_price = coalesce(final_price, 0),
  seller_payout = coalesce(seller_payout, 0),
  royalty_percent = coalesce(royalty_percent, 0),
  ownership_type = coalesce(ownership_type, 'marketplace'),
  approved = coalesce(approved, false),
  active = coalesce(active, true),
  condition = coalesce(condition, 'excellent'),
  total_rentals = coalesce(total_rentals, 0),
  max_rentals = coalesce(max_rentals, 12),
  damage_state = coalesce(damage_state, 'active'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.products alter column title set default 'Untitled Product';
alter table public.products alter column description set default '';
alter table public.products alter column category set default 'Uncategorized';
alter table public.products alter column images set default '{}';
alter table public.products alter column requested_price set default 0;
alter table public.products alter column final_price set default 0;
alter table public.products alter column seller_payout set default 0;
alter table public.products alter column royalty_percent set default 0;
alter table public.products alter column ownership_type set default 'marketplace';
alter table public.products alter column approved set default false;
alter table public.products alter column active set default true;
alter table public.products alter column condition set default 'excellent';
alter table public.products alter column total_rentals set default 0;
alter table public.products alter column max_rentals set default 12;
alter table public.products alter column damage_state set default 'active';
alter table public.products alter column created_at set default now();
alter table public.products alter column updated_at set default now();

alter table public.products alter column title set not null;
alter table public.products alter column description set not null;
alter table public.products alter column category set not null;
alter table public.products alter column images set not null;
alter table public.products alter column requested_price set not null;
alter table public.products alter column final_price set not null;
alter table public.products alter column seller_payout set not null;
alter table public.products alter column royalty_percent set not null;
alter table public.products alter column ownership_type set not null;
alter table public.products alter column approved set not null;
alter table public.products alter column active set not null;
alter table public.products alter column condition set not null;
alter table public.products alter column total_rentals set not null;
alter table public.products alter column max_rentals set not null;
alter table public.products alter column damage_state set not null;
alter table public.products alter column created_at set not null;
alter table public.products alter column updated_at set not null;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid()
);

alter table public.orders add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.orders add column if not exists total numeric(10,2) default 0;
alter table public.orders add column if not exists status text default 'pending';
alter table public.orders add column if not exists created_at timestamptz default now();
alter table public.orders add column if not exists updated_at timestamptz default now();

update public.orders
set
  total = coalesce(total, 0),
  status = coalesce(status, 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.orders alter column total set default 0;
alter table public.orders alter column status set default 'pending';
alter table public.orders alter column created_at set default now();
alter table public.orders alter column updated_at set default now();

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid()
);

alter table public.bookings add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.bookings add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.bookings add column if not exists order_id uuid references public.orders(id) on delete set null;
alter table public.bookings add column if not exists start_date date;
alter table public.bookings add column if not exists end_date date;
alter table public.bookings add column if not exists blocked_until timestamptz;
alter table public.bookings add column if not exists booking_status text default 'locked';
alter table public.bookings add column if not exists created_at timestamptz default now();
alter table public.bookings add column if not exists updated_at timestamptz default now();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid()
);

alter table public.order_items add column if not exists order_id uuid references public.orders(id) on delete cascade;
alter table public.order_items add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.order_items add column if not exists booking_id uuid references public.bookings(id) on delete set null;
alter table public.order_items add column if not exists start_date date;
alter table public.order_items add column if not exists end_date date;
alter table public.order_items add column if not exists daily_rate numeric(10,2) default 0;
alter table public.order_items add column if not exists rental_days integer default 1;
alter table public.order_items add column if not exists line_total numeric(10,2) default 0;
alter table public.order_items add column if not exists earnings_generated boolean default false;
alter table public.order_items add column if not exists rental_counted boolean default false;
alter table public.order_items add column if not exists created_at timestamptz default now();

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid()
);

alter table public.earnings add column if not exists seller_id uuid references public.profiles(id) on delete cascade;
alter table public.earnings add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.earnings add column if not exists order_id uuid references public.orders(id) on delete set null;
alter table public.earnings add column if not exists order_item_id uuid references public.order_items(id) on delete set null;
alter table public.earnings add column if not exists amount numeric(10,2) default 0;
alter table public.earnings add column if not exists type text default 'seller_payout';
alter table public.earnings add column if not exists created_at timestamptz default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, phone, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Rewearly User'),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'address', 'Pending')
  )
  on conflict (id) do update
  set
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.prevent_booking_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  conflicting_count integer;
begin
  select count(*)
  into conflicting_count
  from public.bookings b
  where b.product_id = new.product_id
    and b.id <> coalesce(new.id, gen_random_uuid())
    and coalesce(b.booking_status, 'locked') not in ('released', 'cancelled')
    and (
      coalesce(b.booking_status, 'locked') <> 'locked'
      or b.blocked_until is null
      or b.blocked_until > now()
    )
    and daterange(new.start_date, new.end_date + 3, '[]')
        && daterange(b.start_date, b.end_date + 3, '[]');

  if conflicting_count > 0 then
    raise exception 'Selected dates overlap with an existing booking or cleaning buffer';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_prevent_overlap on public.bookings;
create trigger bookings_prevent_overlap
before insert or update on public.bookings
for each row execute function public.prevent_booking_overlap();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.bookings enable row level security;
alter table public.order_items enable row level security;
alter table public.earnings enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles insert own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;

create policy "profiles select own or admin" on public.profiles
for select
using (
  auth.uid() = id or public.is_admin()
);

create policy "profiles insert own or admin" on public.profiles
for insert
with check (
  auth.uid() = id or public.is_admin()
);

create policy "profiles update own or admin" on public.profiles
for update
using (
  auth.uid() = id or public.is_admin()
)
with check (
  auth.uid() = id or public.is_admin()
);

drop policy if exists "insert products" on public.products;
drop policy if exists "products public read approved active" on public.products;
drop policy if exists "public read products" on public.products;
drop policy if exists "products seller insert own" on public.products;
drop policy if exists "products seller update own pending or admin" on public.products;
drop policy if exists "products seller update own or admin" on public.products;
drop policy if exists "products admin delete" on public.products;

create policy "products public read approved active" on public.products
for select
using (
  public.is_admin()
  or seller_id = auth.uid()
  or (approved = true and active = true and damage_state = 'active')
);

create policy "products seller insert own" on public.products
for insert
with check (
  seller_id = auth.uid() or public.is_admin()
);

create policy "products seller update own or admin" on public.products
for update
using (
  seller_id = auth.uid() or public.is_admin()
)
with check (
  seller_id = auth.uid() or public.is_admin()
);

create policy "products admin delete" on public.products
for delete
using (
  public.is_admin()
);

drop policy if exists "insert orders" on public.orders;
drop policy if exists "orders select own or admin" on public.orders;
drop policy if exists "orders insert own or admin" on public.orders;
drop policy if exists "orders update admin" on public.orders;

create policy "orders select own or admin" on public.orders
for select
using (
  user_id = auth.uid() or public.is_admin()
);

create policy "orders insert own or admin" on public.orders
for insert
with check (
  user_id = auth.uid() or public.is_admin()
);

create policy "orders update admin" on public.orders
for update
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists "bookings select own seller admin" on public.bookings;
drop policy if exists "bookings insert own" on public.bookings;
drop policy if exists "bookings update own or admin" on public.bookings;

create policy "bookings select own seller admin" on public.bookings
for select
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.products p
    where p.id = bookings.product_id
      and p.seller_id = auth.uid()
  )
);

create policy "bookings insert own" on public.bookings
for insert
with check (
  user_id = auth.uid() or public.is_admin()
);

create policy "bookings update own or admin" on public.bookings
for update
using (
  user_id = auth.uid() or public.is_admin()
)
with check (
  user_id = auth.uid() or public.is_admin()
);

drop policy if exists "order_items select own seller admin" on public.order_items;
drop policy if exists "order_items insert own order or admin" on public.order_items;
drop policy if exists "order_items update admin" on public.order_items;

create policy "order_items select own seller admin" on public.order_items
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.products p
    where p.id = order_items.product_id
      and p.seller_id = auth.uid()
  )
);

create policy "order_items insert own order or admin" on public.order_items
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.user_id = auth.uid()
  )
);

create policy "order_items update admin" on public.order_items
for update
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

drop policy if exists "earnings select own or admin" on public.earnings;
drop policy if exists "earnings insert admin" on public.earnings;
drop policy if exists "earnings update admin" on public.earnings;

create policy "earnings select own or admin" on public.earnings
for select
using (
  seller_id = auth.uid() or public.is_admin()
);

create policy "earnings insert admin" on public.earnings
for insert
with check (
  public.is_admin()
);

create policy "earnings update admin" on public.earnings
for update
using (
  public.is_admin()
)
with check (
  public.is_admin()
);

insert into public.profiles (id, name, email, phone, address)
select
  id,
  coalesce(raw_user_meta_data ->> 'name', 'Rewearly User'),
  coalesce(email, ''),
  coalesce(raw_user_meta_data ->> 'phone', 'Pending'),
  coalesce(raw_user_meta_data ->> 'address', 'Pending')
from auth.users
on conflict (id) do update
set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  updated_at = now();

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
drop policy if exists "product images upload auth" on storage.objects;
drop policy if exists "product images update auth" on storage.objects;
drop policy if exists "product images delete auth" on storage.objects;

create policy "product images public read" on storage.objects
for select
using (
  bucket_id = 'products'
);

create policy "product images upload auth" on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'products'
);

create policy "product images update auth" on storage.objects
for update
to authenticated
using (
  bucket_id = 'products'
)
with check (
  bucket_id = 'products'
);

create policy "product images delete auth" on storage.objects
for delete
to authenticated
using (
  bucket_id = 'products'
);
