-- name: ListApplications :many
SELECT b.*, u.email AS owner_email
FROM businesses b
JOIN memberships m ON m.business_id = b.id JOIN users u ON u.id = m.user_id
WHERE (sqlc.narg(status)::text IS NULL OR b.status = sqlc.narg(status))
  AND (sqlc.narg(q)::text IS NULL OR b.applicant_business_name ILIKE '%' || sqlc.narg(q) || '%'
       OR b.trade_name ILIKE '%' || sqlc.narg(q) || '%' OR u.email ILIKE '%' || sqlc.narg(q) || '%')
  AND (sqlc.narg(cursor_at)::timestamptz IS NULL OR (b.applied_at, b.id) < (sqlc.narg(cursor_at), sqlc.narg(cursor_id)::uuid))
ORDER BY b.applied_at DESC, b.id DESC
LIMIT 50;

-- name: BusinessWithOwner :one
SELECT b.*, u.email AS owner_email, u.name AS owner_name
FROM businesses b
JOIN memberships m ON m.business_id = b.id JOIN users u ON u.id = m.user_id
WHERE b.id = $1;

-- name: ReviewBusiness :one
UPDATE businesses SET status = @status, reviewed_at = now(), reviewed_by = @reviewer, review_note = @note, updated_at = now()
WHERE id = @id AND status IN ('pending', 'rejected') RETURNING *;

-- name: SuspendBusiness :one
UPDATE businesses SET status = 'suspended', suspended_at = now(), suspend_reason = $2, updated_at = now()
WHERE id = $1 AND status IN ('approved', 'active') RETURNING *;

-- name: ReactivateBusiness :one
UPDATE businesses SET status = CASE WHEN onboarded_at IS NULL THEN 'approved' ELSE 'active' END,
  suspended_at = NULL, suspend_reason = NULL, updated_at = now()
WHERE id = $1 AND status = 'suspended' RETURNING *;

-- name: LastActive :one
SELECT s.last_seen_at FROM sessions s JOIN memberships m ON m.user_id = s.user_id
WHERE m.business_id = $1 ORDER BY s.last_seen_at DESC LIMIT 1;

-- name: CountByStatus :many
SELECT status, count(*) FROM businesses GROUP BY status;

-- name: DBSize :one
SELECT pg_database_size(current_database());

-- name: ListAudit :many
SELECT * FROM audit_log
WHERE (sqlc.narg(business_id)::uuid IS NULL OR business_id = sqlc.narg(business_id))
  AND (sqlc.narg(action)::text IS NULL OR action = sqlc.narg(action))
  AND (sqlc.narg(cursor)::bigint IS NULL OR id < sqlc.narg(cursor))
ORDER BY id DESC
LIMIT 50;
