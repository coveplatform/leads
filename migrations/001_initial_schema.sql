-- Enable extension for UUID generation if it is not already enabled.
-- create extension if not exists pgcrypto;

-- Run this in the Neon SQL Editor (https://console.neon.tech)

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  twilio_from_number text not null unique,
  owner_notify_phone text,
  owner_notify_email text,
  booking_link text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text,
  phone text not null,
  email text,
  message text,
  status text not null default 'active' check (status in ('active', 'completed', 'stopped')),
  current_step integer not null default 1,
  answers jsonb not null default '{}'::jsonb,
  last_inbound_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists website_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  business_name text,
  website_url text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_business_phone_status
  on leads (business_id, phone, status, created_at desc);

create index if not exists idx_leads_status
  on leads (status);

create index if not exists idx_website_inquiries_created
  on website_inquiries (created_at desc);
