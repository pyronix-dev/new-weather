-- Remove the existing constraint
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;

-- Add the new constraint with ON DELETE CASCADE
ALTER TABLE public.invoices
ADD CONSTRAINT invoices_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.users(id)
ON DELETE CASCADE;
