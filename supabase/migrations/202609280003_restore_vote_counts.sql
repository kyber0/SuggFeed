-- Restore initial vote counts for seed submissions that were reset to 0 or 1 by the previous count(*) bug
UPDATE public.submissions SET vote_count = 88 WHERE title = 'Slow Computer Facilities' AND vote_count <= 1;
UPDATE public.submissions SET vote_count = 94 WHERE title = 'Inadequate Library Resources and Outdated Materials' AND vote_count <= 1;
UPDATE public.submissions SET vote_count = 67 WHERE title = 'Unfair Treatment' AND vote_count <= 1;
UPDATE public.submissions SET vote_count = 82 WHERE title = 'Poor Classroom Ventilation and Temperature Control' AND vote_count <= 1;
UPDATE public.submissions SET vote_count = 105 WHERE title = 'Inadequate Parking Facilities' AND vote_count <= 1;
UPDATE public.submissions SET vote_count = 118 WHERE title = 'Poor Cafeteria Food Quality and Limited Options' AND vote_count <= 5;
