-- Local dev seed (idempotent). Log in via POST /api/dev/login {"email": "..."} or the dev buttons on /login.
-- Phase 4 adds the active "Soni Jewellers" business with bills via cmd/seed.

INSERT INTO users (id, email, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'pending@example.com',   'Pending Owner'),
  ('00000000-0000-0000-0000-000000000002', 'rejected@example.com',  'Rejected Owner'),
  ('00000000-0000-0000-0000-000000000003', 'approved@example.com',  'Approved Owner'),
  ('00000000-0000-0000-0000-000000000005', 'suspended@example.com', 'Suspended Owner'),
  ('00000000-0000-0000-0000-000000000009', 'admin@example.com',     'Admin')
ON CONFLICT DO NOTHING;

INSERT INTO businesses (id, status, applicant_business_name, applicant_owner_name, applicant_phone, applicant_city,
                        reviewed_at, reviewed_by, review_note, onboarding_step, suspended_at, suspend_reason) VALUES
  ('10000000-0000-0000-0000-000000000001', 'pending',   'Pending Jewellers',   'Pending Owner',   '+919800000001', 'Jaipur', NULL, NULL, NULL, 0, NULL, NULL),
  ('10000000-0000-0000-0000-000000000002', 'rejected',  'Rejected Jewellers',  'Rejected Owner',  '+919800000002', 'Delhi',  now(), 'admin@example.com', 'Please add your GSTIN', 0, NULL, NULL),
  ('10000000-0000-0000-0000-000000000003', 'approved',  'Approved Jewellers',  'Approved Owner',  '+919800000003', 'Surat',  now(), 'admin@example.com', NULL, 3, NULL, NULL),
  ('10000000-0000-0000-0000-000000000005', 'suspended', 'Suspended Jewellers', 'Suspended Owner', '+919800000005', 'Pune',   now(), 'admin@example.com', NULL, 0, now(), 'Test suspension')
ON CONFLICT DO NOTHING;

INSERT INTO memberships (business_id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;
