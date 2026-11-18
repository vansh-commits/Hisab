-- name: UserByIdentity :one
SELECT u.* FROM users u JOIN auth_identities i ON i.user_id = u.id
WHERE i.provider = $1 AND i.subject = $2;

-- name: UserByEmail :one
SELECT * FROM users WHERE email = $1;

-- name: CreateUser :one
INSERT INTO users (email, name, avatar_url) VALUES ($1, $2, $3) RETURNING *;

-- name: CreateIdentity :exec
INSERT INTO auth_identities (user_id, provider, subject, email) VALUES ($1, $2, $3, $4);

-- name: TouchUserLogin :exec
UPDATE users SET last_login_at = now(), name = COALESCE(NULLIF(@name::text, ''), name),
  avatar_url = COALESCE(@avatar_url, avatar_url)
WHERE id = @id;

-- name: CreateSession :exec
INSERT INTO sessions (token_hash, user_id, audience, expires_at, absolute_expires_at, ip, user_agent)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: SessionUser :one
SELECT s.user_id, s.last_seen_at, s.absolute_expires_at, u.email, u.name, u.avatar_url
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1 AND s.audience = $2 AND s.expires_at > now();

-- name: TouchSession :exec
UPDATE sessions SET last_seen_at = now(), expires_at = LEAST(now() + make_interval(secs => @idle_secs::int), absolute_expires_at)
WHERE token_hash = @token_hash;

-- name: DeleteSession :exec
DELETE FROM sessions WHERE token_hash = $1;

-- name: PruneSessions :exec
DELETE FROM sessions WHERE expires_at < now();

-- name: MyBusiness :one
SELECT b.* FROM businesses b JOIN memberships m ON m.business_id = b.id WHERE m.user_id = $1;

-- name: CreateApplication :one
INSERT INTO businesses (applicant_business_name, applicant_owner_name, applicant_phone, applicant_city, applicant_gstin)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: CreateMembership :exec
INSERT INTO memberships (business_id, user_id) VALUES ($1, $2);

-- name: UpdateApplication :one
UPDATE businesses SET applicant_business_name = $2, applicant_owner_name = $3, applicant_phone = $4,
  applicant_city = $5, applicant_gstin = $6, status = 'pending', applied_at = now(), updated_at = now()
WHERE id = $1 AND status IN ('pending', 'rejected') RETURNING *;

-- name: Audit :exec
INSERT INTO audit_log (actor_type, actor_user_id, actor_email, business_id, action, entity_type, entity_id, data, ip)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
