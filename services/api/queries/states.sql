-- name: ListStates :many
SELECT code, name, is_ut_without_legislature FROM states ORDER BY code;
