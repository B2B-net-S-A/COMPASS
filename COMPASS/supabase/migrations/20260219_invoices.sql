-- ============================================================
-- Invoices — system rozliczeń faktur konsultantów
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,                    -- np. FV/2026/02/001
    amount DECIMAL(12,2) NOT NULL,                   -- kwota netto
    currency TEXT DEFAULT 'PLN',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,   -- data wystawienia
    due_date DATE,                                   -- termin płatności
    period_month INTEGER,                            -- za jaki miesiąc (1-12)
    period_year INTEGER,                             -- za jaki rok
    file_url TEXT,                                   -- URL do pliku PDF w storage
    file_name TEXT,                                  -- oryginalna nazwa pliku
    status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'approved', 'paid', 'rejected')),
    notes TEXT,                                      -- uwagi konsultanta
    reviewed_by UUID REFERENCES auth.users(id),      -- kto zweryfikował
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_invoices_consultant ON invoices(consultant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

-- RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Konsultant widzi tylko swoje faktury
CREATE POLICY "Consultants can view own invoices"
    ON invoices FOR SELECT
    USING (auth.uid() = consultant_id);

-- Konsultant może dodawać swoje faktury
CREATE POLICY "Consultants can insert own invoices"
    ON invoices FOR INSERT
    WITH CHECK (auth.uid() = consultant_id);

-- Konsultant może aktualizować swoje faktury w statusie 'submitted' (jeszcze nie zweryfikowane)
CREATE POLICY "Consultants can update own submitted invoices"
    ON invoices FOR UPDATE
    USING (auth.uid() = consultant_id AND status = 'submitted')
    WITH CHECK (auth.uid() = consultant_id);

-- Admin/Centrala widzi wszystkie faktury
CREATE POLICY "Admins can view all invoices"
    ON invoices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'admin', 'centrala')
        )
    );

-- Admin/Centrala może aktualizować status faktur (weryfikacja, zatwierdzanie)
CREATE POLICY "Admins can update all invoices"
    ON invoices FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'admin', 'centrala')
        )
    );

-- Storage bucket dla faktur (jeśli nie istnieje)
-- UWAGA: Bucket trzeba utworzyć ręcznie w Supabase Dashboard → Storage → New bucket
-- Nazwa: "invoices", Public: false
