ALTER TABLE public.doubts
DROP CONSTRAINT IF EXISTS doubts_upvotes_nonnegative_check;

ALTER TABLE public.doubts
ADD CONSTRAINT doubts_upvotes_nonnegative_check
CHECK (upvotes >= 0);

DROP POLICY IF EXISTS "authenticated users can update doubt upvotes" ON public.doubts;

CREATE POLICY "authenticated users can update doubt upvotes"
  ON public.doubts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL AND upvotes >= 0);

REVOKE UPDATE ON TABLE public.doubts FROM anon, authenticated;
GRANT UPDATE (upvotes) ON TABLE public.doubts TO authenticated;
