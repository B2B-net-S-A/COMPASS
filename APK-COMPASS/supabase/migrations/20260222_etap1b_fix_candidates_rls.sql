-- ETAP 1b: Naprawa RLS na candidates
-- Problem: polityka sprawdza tylko role='admin', nie 'administrator' ani 'centrala'
-- ROLLBACK: Przywrocic stare polityki z FIX_CANDIDATES_RLS_FINAL.sql

-- Usun stare polityki
DROP POLICY IF EXISTS "Admins can manage candidates" ON candidates;
DROP POLICY IF EXISTS "Users can view their own candidate record" ON candidates;
DROP POLICY IF EXISTS "Users can insert their own candidate record" ON candidates;
DROP POLICY IF EXISTS "Users can update their own candidate record" ON candidates;
DROP POLICY IF EXISTS "Centrala can view candidates" ON candidates;

-- 1. Admini (admin + administrator) maja pelny dostep
CREATE POLICY "Admins can manage candidates" ON candidates
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'administrator')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'administrator')
    )
);

-- 2. Centrala moze czytac kandydatow
CREATE POLICY "Centrala can view candidates" ON candidates
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'centrala'
    )
);

-- 3. Konsultant widzi tylko swoj rekord
CREATE POLICY "Users can view own candidate" ON candidates
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 4. Konsultant moze wstawic swoj rekord
CREATE POLICY "Users can insert own candidate" ON candidates
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- 5. Konsultant moze aktualizowac swoj rekord
CREATE POLICY "Users can update own candidate" ON candidates
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
