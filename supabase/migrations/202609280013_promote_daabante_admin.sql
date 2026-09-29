-- Migration: Promote daabante to admin
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE email = 'daabante@my.cspc.edu.ph';
