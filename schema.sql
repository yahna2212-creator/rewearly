create extension if not exists "pgcrypto";

create type ownership_type_enum as enum ('marketplace', 'owned');
create type product_condition_enum as enum ('new_with_tags', 'excellent', 'very_good', 'good');
create type damage_state_enum as enum ('active', 'damaged');
create type booking_status_enum as enum ('locked', 'confirmed', 'completed', 'released', 'cancelled');
create type order_status_enum as enum ('pending', 'paid', 'dispatched', 'delivered', 'completed');
create type earning_type_enum as enum ('seller_payout', 'royalty');

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yahna2212@gmail.com';
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  images text[] not null default '{}',
  requested_price numeric(10,2) not null check (requested_price >= 0),
  final_price numeric(10,2) not null default 0 check (final_price >= 0),
  seller_payout numeric(10,2) not null default 0 check (seller_payout >= 0),
  royalty_percent numeric(5,2) not null default 0 check (royalty_percent >= 0 and royalty_percent <= 100),
  ownership_type ownership_type_enum not null default 'marketplace',
  approved boolean not null default false,
  active boolean not null default true,
  condition product_condition_enum not null default 'excellent',
  seller_id uuid references public.profiles(id) on delete set null,
  total_rentals integer not null default 0 check (total_rentals >= 0),
  max_rentals integer not null default 12 check (max_rentals > 0),
  damage_state damage_state_enum not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  total numeric(10,2) not null check (total >= 0),
  status order_status_enum not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  start_date date not null,
  end_date date not null,
  blocked_until timestamptz,
  booking_status booking_status_enum not null default 'locked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(10,2) not null check (daily_rate >= 0),
  rental_days integer not null check (rental_days > 0),
  line_total numeric(10,2) not null check (line_total >= 0),
  earnings_generated boolean not null default false,
  rental_counted boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid unique references public.order_items(id) on delete set null,
  amount numeric(10,2) not null check (amount >= 0),
  type earning_type_enum not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
    address = excluded.address;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at before update on public.bookings
for each row execute function public.touch_updated_at();

create or replace function public.prevent_booking_overlap()
returns trigger
language plpgsql
as $$
declare
  conflicting_count integer;
begin
  select count(*)
  into conflicting_count
  from public.bookings b
  where b.product_id = new.product_id
    and b.id <> coalesce(new.id, gen_random_uuid())
    and b.booking_status not in ('released', 'cancelled')
    and (
      b.booking_status <> 'locked'
      or b.blocked_until is null
      or b.blocked_until > now()
    )
    and daterange(new.start_date, new.end_date + 3, '[]') && daterange(b.start_date, b.end_date + 3, '[]');

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
alter table public.bookings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.earnings enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin" on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
for insert with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles update own or admin" on public.profiles;
create policy "profiles update own or admin" on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "products public read approved active" on public.products;
create policy "products public read approved active" on public.products
for select using (
  public.is_admin()
  or seller_id = auth.uid()
  or (approved = true and active = true and damage_state = 'active')
);

drop policy if exists "products seller insert own" on public.products;
create policy "products seller insert own" on public.products
for insert with check (seller_id = auth.uid() or public.is_admin());

drop policy if exists "products seller update own pending or admin" on public.products;
create policy "products seller update own pending or admin" on public.products
for update using (public.is_admin() or seller_id = auth.uid())
with check (public.is_admin() or seller_id = auth.uid());

drop policy if exists "products admin delete" on public.products;
create policy "products admin delete" on public.products
for delete using (public.is_admin());

drop policy if exists "bookings select own seller admin" on public.bookings;
create policy "bookings select own seller admin" on public.bookings
for select using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1 from public.products p where p.id = bookings.product_id and p.seller_id = auth.uid()
  )
);

drop policy if exists "bookings insert own" on public.bookings;
create policy "bookings insert own" on public.bookings
for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "bookings update own or admin" on public.bookings;
create policy "bookings update own or admin" on public.bookings
for update using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "orders select own or admin" on public.orders;
create policy "orders select own or admin" on public.orders
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "orders insert own or admin" on public.orders;
create policy "orders insert own or admin" on public.orders
for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "orders update admin" on public.orders;
create policy "orders update admin" on public.orders
for update using (public.is_admin())
with check (public.is_admin());

drop policy if exists "order_items select own seller admin" on public.order_items;
create policy "order_items select own seller admin" on public.order_items
for select using (
  public.is_admin()
  or exists (
    select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid()
  )
  or exists (
    select 1 from public.products p where p.id = order_items.product_id and p.seller_id = auth.uid()
  )
);

drop policy if exists "order_items insert own order or admin" on public.order_items;
create policy "order_items insert own order or admin" on public.order_items
for insert with check (
  public.is_admin()
  or exists (
    select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid()
  )
);

drop policy if exists "order_items update admin" on public.order_items;
create policy "order_items update admin" on public.order_items
for update using (public.is_admin())
with check (public.is_admin());

drop policy if exists "earnings select own or admin" on public.earnings;
create policy "earnings select own or admin" on public.earnings
for select using (seller_id = auth.uid() or public.is_admin());

drop policy if exists "earnings insert admin" on public.earnings;
create policy "earnings insert admin" on public.earnings
for insert with check (public.is_admin());

drop policy if exists "earnings update admin" on public.earnings;
create policy "earnings update admin" on public.earnings
for update using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects
for select using (bucket_id = 'products');

drop policy if exists "product images upload auth" on storage.objects;
create policy "product images upload auth" on storage.objects
for insert with check (
  bucket_id = 'products'
  and auth.role() = 'authenticated'
);

drop policy if exists "product images update own or admin" on storage.objects;
create policy "product images update own or admin" on storage.objects
for update using (
  bucket_id = 'products'
  and auth.role() = 'authenticated'
);

drop policy if exists "product images delete own or admin" on storage.objects;
create policy "product images delete own or admin" on storage.objects
for delete using (
  bucket_id = 'products'
  and auth.role() = 'authenticated'
);
