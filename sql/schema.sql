-- ═══════════════════════════════════════════════════
-- BUILD MANAGER — Supabase Database Schema v2
-- Run in Supabase SQL Editor → https://supabase.com
-- Safe to re-run (IF NOT EXISTS + DROP IF EXISTS).
-- ═══════════════════════════════════════════════════

-- ── 1. PROFILES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT DEFAULT '',
  company     TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  avatar_url  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 2. PROJECTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Untitled Project',
  address      TEXT DEFAULT '',
  client       TEXT DEFAULT '',
  type         TEXT DEFAULT 'residential',
  total_budget NUMERIC DEFAULT 0,
  contingency  NUMERIC DEFAULT 10,
  currency     TEXT DEFAULT 'INR',
  contractor   TEXT DEFAULT '',
  start_date   DATE,
  end_date     DATE,
  notes        TEXT DEFAULT '',
  archived     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);


-- ── 3. PHASES ──────────────────────────────────────
-- phase_number: 1–9 = nine trade phases, 10 = Interior
-- data: JSONB blob — stores all line items for the phase.
-- NOTE: The app serialises data via JSON.stringify() before
--       sending to Supabase. The default here is the literal
--       JSON text '{}' (not a Postgres expression), which is
--       what the supabase-js v2 client expects for JSONB cols.
CREATE TABLE IF NOT EXISTS public.phases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_number  INTEGER NOT NULL CHECK (phase_number BETWEEN 1 AND 200),
  name          TEXT NOT NULL,
  icon          TEXT DEFAULT 'listChecks',
  completion    INTEGER DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
  data          JSONB DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON public.phases(project_id);

-- v2.2 migration: phase_number range widened from 1..12 → 1..200 so the new
-- Electrical Supply phase (#11) + 8 interior section phases (#20-27) +
-- custom user-added phases (#30+) all fit.
ALTER TABLE public.phases DROP CONSTRAINT IF EXISTS phases_phase_number_check;


-- ── 4. SUBCONTRACTORS ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trade       TEXT DEFAULT '',
  company     TEXT DEFAULT '',
  contact     TEXT DEFAULT '',
  phone       TEXT DEFAULT '',
  email       TEXT DEFAULT '',
  phase       TEXT DEFAULT '',
  contract    NUMERIC DEFAULT 0,
  paid        NUMERIC DEFAULT 0,
  retention   NUMERIC DEFAULT 0,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontractors_project_id ON public.subcontractors(project_id);


-- ── 5. INVOICES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subcontractor_id   UUID REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  invoice_number     TEXT DEFAULT '',
  amount             NUMERIC DEFAULT 0,
  status             TEXT DEFAULT 'pending',
  due_date           DATE,
  paid_date          DATE,
  notes              TEXT DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);


-- ── 6. PUNCH ITEMS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.punch_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_number  TEXT DEFAULT '',
  description  TEXT DEFAULT '',
  location     TEXT DEFAULT '',
  assigned_to  TEXT DEFAULT '',
  priority     TEXT DEFAULT 'normal',
  status       TEXT DEFAULT 'open',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_punch_items_project_id ON public.punch_items(project_id);


-- ═══════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_items    ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Projects
DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Phases (via project ownership)
DROP POLICY IF EXISTS "phases_all" ON public.phases;
CREATE POLICY "phases_all" ON public.phases FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = phases.project_id AND projects.user_id = auth.uid())
);

-- Subcontractors
DROP POLICY IF EXISTS "subs_all" ON public.subcontractors;
CREATE POLICY "subs_all" ON public.subcontractors FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = subcontractors.project_id AND projects.user_id = auth.uid())
);

-- Invoices
DROP POLICY IF EXISTS "invoices_all" ON public.invoices;
CREATE POLICY "invoices_all" ON public.invoices FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = invoices.project_id AND projects.user_id = auth.uid())
);

-- Punch Items
DROP POLICY IF EXISTS "punch_all" ON public.punch_items;
CREATE POLICY "punch_all" ON public.punch_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = punch_items.project_id AND projects.user_id = auth.uid())
);


-- ═══════════════════════════════════════════════════
-- AUTO-UPDATE TIMESTAMPS
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.projects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.phases;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.subcontractors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ── 7. LABOUR (Hajiri) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.labour (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  role        TEXT DEFAULT 'mazdoor',
  daily_rate  NUMERIC DEFAULT 0,
  phone       TEXT DEFAULT '',
  balance     NUMERIC DEFAULT 0,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labour_project_id ON public.labour(project_id);

CREATE TABLE IF NOT EXISTS public.labour_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  labour_id   UUID NOT NULL REFERENCES public.labour(id) ON DELETE CASCADE,
  log_date    DATE NOT NULL,
  status      TEXT DEFAULT 'full', -- full, half, absent
  kharchi     NUMERIC DEFAULT 0,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labour_logs_project_id ON public.labour_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_labour_logs_labour_id ON public.labour_logs(labour_id);

ALTER TABLE public.labour      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labour_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labour_all" ON public.labour;
CREATE POLICY "labour_all" ON public.labour FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = labour.project_id AND projects.user_id = auth.uid())
);

DROP POLICY IF EXISTS "labour_logs_all" ON public.labour_logs;
CREATE POLICY "labour_logs_all" ON public.labour_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = labour_logs.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.labour;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.labour
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ── 8. VENDORS (Udhaar / Credit Khata) ──────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  shop_name     TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  balance       NUMERIC DEFAULT 0,
  total_amount  NUMERIC DEFAULT 0,
  paid_amount   NUMERIC DEFAULT 0,
  opening_balance NUMERIC DEFAULT 0,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_project_id ON public.vendors(project_id);

CREATE TABLE IF NOT EXISTS public.vendor_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id   UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  txn_date    DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  amount      NUMERIC NOT NULL DEFAULT 0,
  total_amount     NUMERIC NOT NULL DEFAULT 0,
  paid_amount      NUMERIC NOT NULL DEFAULT 0,
  remaining_amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_txns_project_id ON public.vendor_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_vendor_txns_vendor_id ON public.vendor_transactions(vendor_id);

-- ── v2.2 migration: vendor khata now tracks total/paid/remaining per transaction ──
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS opening_balance NUMERIC DEFAULT 0;
ALTER TABLE public.vendor_transactions ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.vendor_transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.vendor_transactions ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.vendors              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_transactions  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_all" ON public.vendors;
CREATE POLICY "vendors_all" ON public.vendors FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = vendors.project_id AND projects.user_id = auth.uid())
);

DROP POLICY IF EXISTS "vendor_txns_all" ON public.vendor_transactions;
CREATE POLICY "vendor_txns_all" ON public.vendor_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = vendor_transactions.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.vendors;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ── 9. MATERIALS (Site Stock / Inventory) ────────────────────
CREATE TABLE IF NOT EXISTS public.materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  unit          TEXT DEFAULT 'bags',
  current_stock NUMERIC DEFAULT 0,
  total_inward  NUMERIC DEFAULT 0,
  total_outward NUMERIC DEFAULT 0,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_project_id ON public.materials(project_id);

CREATE TABLE IF NOT EXISTS public.material_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  material_id   UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  log_date      DATE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('inward', 'outward')),
  qty           NUMERIC NOT NULL DEFAULT 0,
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_material_logs_project_id ON public.material_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_material_logs_material_id ON public.material_logs(material_id);

ALTER TABLE public.materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "materials_all" ON public.materials;
CREATE POLICY "materials_all" ON public.materials FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = materials.project_id AND projects.user_id = auth.uid())
);

DROP POLICY IF EXISTS "material_logs_all" ON public.material_logs;
CREATE POLICY "material_logs_all" ON public.material_logs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = material_logs.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.materials;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ── 10. RA BILLS (Running Account Invoices) ──────────────────
CREATE TABLE IF NOT EXISTS public.ra_bills (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  bill_number         TEXT DEFAULT '',
  issue_date          DATE,
  due_date            DATE,
  work_description    TEXT DEFAULT '',
  contract_value      NUMERIC DEFAULT 0,
  percentage_complete NUMERIC DEFAULT 0 CHECK (percentage_complete BETWEEN 0 AND 100),
  previous_paid       NUMERIC DEFAULT 0,
  deductions          NUMERIC DEFAULT 0,
  amount_due          NUMERIC DEFAULT 0,
  status              TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ra_bills ADD COLUMN IF NOT EXISTS boq_items JSONB DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS idx_ra_bills_project_id ON public.ra_bills(project_id);

ALTER TABLE public.ra_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ra_bills_all" ON public.ra_bills;
CREATE POLICY "ra_bills_all" ON public.ra_bills FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = ra_bills.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.ra_bills;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.ra_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ── 11. LEADS (Quick Leads — potential customer contacts) ──────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT DEFAULT '',
  address     TEXT DEFAULT '',
  source      TEXT DEFAULT '',
  status      TEXT DEFAULT 'new',
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_project_id ON public.leads(project_id);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_all" ON public.leads;
CREATE POLICY "leads_all" ON public.leads FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = leads.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.leads;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ── 12. SITE PHOTOS (Construction site photo / video log) ──────────
CREATE TABLE IF NOT EXISTS public.site_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  category    TEXT DEFAULT '',
  image_url   TEXT DEFAULT '',
  thumbnail   TEXT DEFAULT '',
  video_url   TEXT DEFAULT '',
  taken_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_project_id ON public.site_photos(project_id);

-- v2.2 migration: site_photos now also stores short site videos
ALTER TABLE public.site_photos ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT '';

ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_photos_all" ON public.site_photos;
CREATE POLICY "site_photos_all" ON public.site_photos FOR ALL USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = site_photos.project_id AND projects.user_id = auth.uid())
);

DROP TRIGGER IF EXISTS set_updated_at ON public.site_photos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.site_photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
