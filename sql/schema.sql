-- ═══════════════════════════════════════════════════
-- BUILD MANAGER — Supabase Database Schema
-- Run this in Supabase SQL Editor (https://supabase.com)
-- ═══════════════════════════════════════════════════

-- ── 1. PROFILES ────────────────────────────────────
-- Extends auth.users with app-specific data
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ── 2. PROJECTS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Project',
  address TEXT DEFAULT '',
  client TEXT DEFAULT '',
  type TEXT DEFAULT 'residential',
  total_budget NUMERIC DEFAULT 0,
  contingency NUMERIC DEFAULT 10,
  currency TEXT DEFAULT 'INR',
  contractor TEXT DEFAULT '',
  start_date DATE,
  end_date DATE,
  notes TEXT DEFAULT '',
  archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);


-- ── 3. PHASES ──────────────────────────────────────
-- 8 phases per project, flexible JSONB for field data
CREATE TABLE IF NOT EXISTS public.phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL CHECK (phase_number BETWEEN 1 AND 12),  -- supports up to 10 (9 trades + interior)
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  completion INTEGER DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
  data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, phase_number)
);

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON public.phases(project_id);


-- ── 4. SUBCONTRACTORS ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.subcontractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trade TEXT DEFAULT '',
  company TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phase TEXT DEFAULT '',
  contract NUMERIC DEFAULT 0,
  paid NUMERIC DEFAULT 0,
  retention NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subcontractors_project_id ON public.subcontractors(project_id);


-- ── 5. INVOICES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subcontractor_id UUID REFERENCES public.subcontractors(id) ON DELETE SET NULL,
  invoice_number TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  due_date DATE,
  paid_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);


-- ── 6. PUNCH ITEMS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.punch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  item_number TEXT DEFAULT '',
  description TEXT DEFAULT '',
  location TEXT DEFAULT '',
  assigned_to TEXT DEFAULT '',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_punch_items_project_id ON public.punch_items(project_id);


-- ═══════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Users can only access their own data
-- ═══════════════════════════════════════════════════

-- Profiles: own row only
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Projects: owned by user
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view own projects" ON public.projects
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
CREATE POLICY "Users can insert own projects" ON public.projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE USING (auth.uid() = user_id);

-- Phases: via project ownership
ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage phases of own projects" ON public.phases;
CREATE POLICY "Users can manage phases of own projects" ON public.phases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = phases.project_id AND projects.user_id = auth.uid())
  );

-- Subcontractors: via project ownership
ALTER TABLE public.subcontractors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage subs of own projects" ON public.subcontractors;
CREATE POLICY "Users can manage subs of own projects" ON public.subcontractors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = subcontractors.project_id AND projects.user_id = auth.uid())
  );

-- Invoices: via project ownership
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage invoices of own projects" ON public.invoices;
CREATE POLICY "Users can manage invoices of own projects" ON public.invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = invoices.project_id AND projects.user_id = auth.uid())
  );

-- Punch Items: via project ownership
ALTER TABLE public.punch_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage punch items of own projects" ON public.punch_items;
CREATE POLICY "Users can manage punch items of own projects" ON public.punch_items
  FOR ALL USING (
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
