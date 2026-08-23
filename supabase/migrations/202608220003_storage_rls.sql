create policy "staff read attachments" on storage.objects for select using (bucket_id = 'submission-attachments' and public.is_staff());
