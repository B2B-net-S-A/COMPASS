-- BUGFIX 1: RLS blokuje claimCandidate() gdy user_id IS NULL
-- Problem: polityka "Users can update own candidate" wymaga user_id = auth.uid(),
-- ale przy claimowaniu kandydata user_id jest jeszcze NULL.
-- ROLLBACK: DROP POLICY "Users can update own candidate" ON candidates; CREATE POLICY ... USING (user_id = auth.uid()) ...

DROP POLICY IF EXISTS "Users can update own candidate" ON candidates;

CREATE POLICY "Users can update own candidate" ON candidates
FOR UPDATE TO authenticated
USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND candidate_status = 'kandydat')
)
WITH CHECK (
    user_id = auth.uid()
    OR (user_id IS NULL AND candidate_status = 'kandydat')
);
