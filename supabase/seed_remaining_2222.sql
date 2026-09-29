-- ==============================================================================
-- SuggFeed: Fast Set-Based Seed to reach exactly 10,000 submissions
-- Current count: 7,778 -> Adding 2,222 submissions -> Final total: 10,000
-- Runs in < 1 second using set-based INSERT ... SELECT generate_series(...)
-- ==============================================================================

WITH categories_list AS (
  SELECT array_agg(id) AS cat_ids FROM public.categories WHERE is_active = true
),
titles AS (
  SELECT ARRAY[
    'Add shaded benches along campus walking paths',
    'Install hand sanitizing stations at all cafeteria entrances',
    'Create an online lost and found portal for students',
    'Upgrade lab microscopes for biology department',
    'Open campus recreation center 1 hour earlier on weekdays',
    'Introduce compost bins alongside cafeteria recycling',
    'Install automated doors for wheelchair accessible entries',
    'Provide free menstrual products in all student restrooms',
    'Set up mobile device charging lockers in student union',
    'Improve soundproofing in music practice rooms',
    'Add pedestrian crosswalk flashers on university avenue',
    'Implement digital ID cards for library checkout and access',
    'Create quiet prayer and meditation rooms in dorms',
    'Offer weekend workshops on resume writing and interview skills',
    'Install additional emergency blue light phones in south parking',
    'Add standing desks in the main library study floor',
    'Launch a campus ride-share board for holiday breaks',
    'Improve cafeteria signage for gluten-free and vegan options',
    'Set up an electronics recycling drop-off bin in engineering building',
    'Extend campus bookstore hours during finals week',
    'Offer free mental health screenings each semester',
    'Add umbrella share stations near main bus stops',
    'Host outdoor movie nights in the campus amphitheater',
    'Provide more whiteboards in group study areas',
    'Upgrade drinking water fountains with chilled bottle refill taps',
    'Create peer mentoring program for incoming freshmen',
    'Improve heating in older lecture halls during winter months',
    'Install solar-powered outdoor phone charging tables',
    'Add express grab-and-go lunch kiosk near science complex',
    'Organize semesterly campus cleanup and sustainability day'
  ] AS title_list
),
descriptions AS (
  SELECT ARRAY[
    'Students walking between classes on hot days need shaded places to rest and study outdoors.',
    'Promoting campus wellness by placing touchless hand sanitizer dispensers at high-traffic dining locations.',
    'A central digital registry where students can report and search for lost items across campus security offices.',
    'Current microscopes in bio lab 204 are scratched and outdated, impacting hands-on lab experiments.',
    'Early morning student athletes and commuter students would benefit from 6:00 AM recreation center openings.',
    'Reducing cafeteria landfill waste by introducing clearly labeled compostable waste disposal bins.',
    'Heavy manual doors at the humanities building make access challenging for students with physical disabilities.',
    'Ensuring health equity and dignity by providing stocked dispenser machines in all campus restrooms.',
    'Secure lockable charging compartments so students can safely charge laptops and phones between classes.',
    'Excessive sound bleed between practice rooms disrupts vocal and instrumental student rehearsals.',
    'High vehicle traffic near the south dorms creates safety hazards for students crossing after sunset.',
    'Allowing students to store their campus ID in Apple Wallet and Google Pay for faster building and library access.',
    'Dedicated quiet and inclusive spaces across residential halls for student prayer, meditation, and reflection.',
    'Practical, student-led career preparation clinics to assist with internship applications and technical interviews.',
    'South parking lot has blind spots where additional well-lit emergency call boxes are urgently needed.',
    'Ergonomic adjustable height workstations for students experiencing back pain from long study sessions.',
    'A verified campus platform helping students coordinate carpools home for Thanksgiving and winter breaks.',
    'Clearer allergen and dietary labeling on daily menus to prevent allergic reactions and improve dining safety.',
    'Safe disposal and recycling for old batteries, cables, and broken electronic peripherals.',
    'Long lines on the first and last weeks of class require extended evening and weekend hours.',
    'Proactive and confidential mental wellness check-ins conducted by licensed university counselors.',
    'Eco-friendly umbrella lending kiosks to keep students dry when sudden rainstorms hit campus.',
    'Strengthening student community through free outdoor cinema screenings on the campus lawn.',
    'Mobile rolling whiteboards enable dynamic group brainstorming and collaborative math/physics problem solving.',
    'Replacing old metal fountains with filtered, chilled bottle refilling units to cut down single-use plastic.',
    'Pairing first-year students with upperclassmen mentors to ease the transition into college academics.',
    'Lecture rooms 101 through 108 suffer from uneven heating, causing discomfort during morning lectures.',
    'Outdoor solar tables with built-in USB ports encourage studying and collaborating in green outdoor spaces.',
    'Students with back-to-back classes need quick pre-packaged sandwich and salad options without 20-minute lines.',
    'Student-led initiative to beautify campus trails, plant native flora, and foster environmental responsibility.'
  ] AS desc_list
)
INSERT INTO public.submissions (
  id,
  title,
  description,
  category_id,
  status,
  vote_count,
  comment_count,
  created_at
)
SELECT
  gen_random_uuid() AS id,
  titles.title_list[1 + (i % array_length(titles.title_list, 1))] || ' (#' || (7778 + i) || ')' AS title,
  descriptions.desc_list[1 + (i % array_length(descriptions.desc_list, 1))] AS description,
  categories_list.cat_ids[1 + (i % array_length(categories_list.cat_ids, 1))] AS category_id,
  CASE
    WHEN i <= 1222 THEN 'pending'::public.submission_status
    WHEN i <= 1722 THEN 'rejected'::public.submission_status
    ELSE 'approved'::public.submission_status
  END AS status,
  (random() * 85)::integer AS vote_count,
  0 AS comment_count,
  now() - (interval '1 hour' * (random() * 720)::integer) AS created_at
FROM generate_series(1, 2222) AS i
CROSS JOIN categories_list
CROSS JOIN titles
CROSS JOIN descriptions;

-- Verify final count
SELECT
  count(*) AS total_submissions,
  count(*) FILTER (WHERE status = 'pending') AS pending_review,
  count(*) FILTER (WHERE status = 'approved') AS approved,
  count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
  count(*) FILTER (WHERE status = 'resolved') AS resolved,
  count(*) FILTER (WHERE status = 'rejected') AS rejected
FROM public.submissions;
