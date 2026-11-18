package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"hisab/internal/email"
	"hisab/migrations"
)

const origin = "https://hisab.test"

type harness struct {
	t    *testing.T
	s    *Server
	h    http.Handler
	mu   sync.Mutex
	sent []email.Message
	idp  *httptest.Server
	// claims the stub IdP puts in the next id_token
	claims map[string]any
}

// newHarness needs TEST_DATABASE_URL (local: the docker hisab_test DB; CI: the postgres service).
// Tests share one DB and truncate it, so they don't run in parallel.
func newHarness(t *testing.T) *harness {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	if err := migrations.Up(ctx, url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, "TRUNCATE users, businesses, audit_log CASCADE"); err != nil {
		t.Fatal(err)
	}
	hs := &harness{t: t}
	hs.idp = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hs.mu.Lock()
		defer hs.mu.Unlock()
		payload, _ := json.Marshal(hs.claims)
		tok := "e30." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "a", "token_type": "Bearer", "expires_in": 3600, "id_token": tok})
	}))
	t.Cleanup(hs.idp.Close)
	hs.s = New(pool, Config{AppOrigin: origin, AdminEmails: map[string]bool{"admin@example.com": true},
		GoogleClientID: "client-1", GoogleSecret: "secret", GoogleTokenURL: hs.idp.URL + "/token"},
		func(_ context.Context, m email.Message) error {
			hs.mu.Lock()
			defer hs.mu.Unlock()
			hs.sent = append(hs.sent, m)
			return nil
		})
	hs.h = hs.s.Routes()
	return hs
}

// do sends a same-origin request; cookie may be nil.
func (hs *harness) do(method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	hs.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	}
	r := httptest.NewRequest(method, path, rd)
	r.Header.Set("Sec-Fetch-Site", "same-origin")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	hs.h.ServeHTTP(w, r)
	return w
}

// login creates a session directly (the OIDC flow has its own tests).
func (hs *harness) login(emailAddr, aud string) *http.Cookie {
	hs.t.Helper()
	u, err := hs.s.loginOrSignup(context.Background(), "google", "sub-"+emailAddr, emailAddr, "Test", nil)
	if err != nil {
		hs.t.Fatal(err)
	}
	w := httptest.NewRecorder()
	if err := hs.s.createSession(context.Background(), w, httptest.NewRequest("GET", "/", nil), u.ID, aud); err != nil {
		hs.t.Fatal(err)
	}
	return w.Result().Cookies()[0]
}

func decodeBody(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &m); err != nil {
		t.Fatalf("status %d body %q: %v", w.Code, w.Body.String(), err)
	}
	return m
}

var app = map[string]any{"business_name": "Soni Jewellers", "owner_name": "Ramesh Soni", "phone": "98765 43210", "city": "Jaipur", "gstin": "27aapfu0939f1zv"}

func TestWaitlistApproveFlow(t *testing.T) {
	hs := newHarness(t)
	c := hs.login("owner@example.com", audApp)

	me := decodeBody(t, hs.do("GET", "/api/me", nil, c))
	if me["business"] != nil {
		t.Fatalf("new user has business: %v", me)
	}
	bad := map[string]any{"business_name": "", "owner_name": "R", "phone": "12345", "city": "J", "gstin": "27AAPFU0939F1ZX"}
	if w := hs.do("POST", "/api/waitlist", bad, c); w.Code != 422 || !strings.Contains(w.Body.String(), `"gstin"`) || !strings.Contains(w.Body.String(), `"phone"`) {
		t.Fatalf("validation: %d %s", w.Code, w.Body)
	}
	w := hs.do("POST", "/api/waitlist", app, c)
	if w.Code != 201 {
		t.Fatalf("apply: %d %s", w.Code, w.Body)
	}
	id := decodeBody(t, w)["business"].(map[string]any)["id"].(string)
	if w := hs.do("POST", "/api/waitlist", app, c); w.Code != 409 {
		t.Fatalf("second apply: %d", w.Code)
	}
	got := decodeBody(t, hs.do("GET", "/api/waitlist", nil, c))["application"].(map[string]any)
	if got["phone"] != "+919876543210" || got["gstin"] != "27AAPFU0939F1ZV" || got["status"] != "pending" {
		t.Fatalf("normalised application: %v", got)
	}

	admin := hs.login("admin@example.com", audAdmin)
	if w := hs.do("POST", "/api/admin/applications/"+id+"/reject", map[string]any{"note": "Add GSTIN"}, admin); w.Code != 200 {
		t.Fatalf("reject: %d %s", w.Code, w.Body)
	}
	if w := hs.do("PUT", "/api/waitlist", app, c); w.Code != 200 || !strings.Contains(w.Body.String(), `"pending"`) {
		t.Fatalf("re-apply: %d %s", w.Code, w.Body)
	}
	w = hs.do("POST", "/api/admin/applications/"+id+"/approve", map[string]any{}, admin)
	if w.Code != 200 || decodeBody(t, w)["email_sent"] != true {
		t.Fatalf("approve: %d %s", w.Code, w.Body)
	}
	if w := hs.do("POST", "/api/admin/applications/"+id+"/approve", map[string]any{}, admin); w.Code != 409 {
		t.Fatalf("double approve: %d", w.Code)
	}
	if w := hs.do("PUT", "/api/waitlist", app, c); w.Code != 409 {
		t.Fatalf("edit after approval: %d", w.Code)
	}
	me = decodeBody(t, hs.do("GET", "/api/me", nil, c))
	if me["business"].(map[string]any)["status"] != "approved" {
		t.Fatalf("me after approve: %v", me)
	}
	subjects := []string{}
	for _, m := range hs.sent {
		subjects = append(subjects, m.Subject)
		if m.To != "owner@example.com" {
			t.Fatalf("mail to %q", m.To)
		}
	}
	if want := "We received your Hisab application|Update on your Hisab application|Your Hisab account is approved"; strings.Join(subjects, "|") != want {
		t.Fatalf("emails: %v", subjects)
	}

	if w := hs.do("POST", "/api/admin/clients/"+id+"/suspend", map[string]any{"reason": "unpaid"}, admin); w.Code != 200 {
		t.Fatalf("suspend: %d %s", w.Code, w.Body)
	}
	if w := hs.do("POST", "/api/admin/clients/"+id+"/reactivate", nil, admin); w.Code != 200 || !strings.Contains(w.Body.String(), `"approved"`) {
		t.Fatalf("reactivate: %d %s", w.Code, w.Body)
	}
	detail := decodeBody(t, hs.do("GET", "/api/admin/clients/"+id, nil, admin))
	if n := len(detail["audit"].([]any)); n < 6 {
		t.Fatalf("audit rows: %d", n)
	}
	if w := hs.do("GET", "/api/admin/clients/not-a-uuid", nil, admin); w.Code != 404 {
		t.Fatalf("bad uuid: %d", w.Code)
	}
	list := decodeBody(t, hs.do("GET", "/api/admin/applications?q=soni", nil, admin))
	if len(list["items"].([]any)) != 1 {
		t.Fatalf("search: %v", list)
	}
}

func TestSessionExpiryAndLogout(t *testing.T) {
	hs := newHarness(t)
	c := hs.login("a@example.com", audApp)
	if w := hs.do("GET", "/api/me", nil, c); w.Code != 200 {
		t.Fatalf("me: %d", w.Code)
	}
	if w := hs.do("POST", "/api/auth/logout", nil, c); w.Code != 204 {
		t.Fatalf("logout: %d", w.Code)
	}
	if w := hs.do("GET", "/api/me", nil, c); w.Code != 401 {
		t.Fatalf("after logout: %d", w.Code)
	}

	c = hs.login("b@example.com", audApp)
	if _, err := hs.s.Pool.Exec(context.Background(), "UPDATE sessions SET expires_at = now() - interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	if w := hs.do("GET", "/api/me", nil, c); w.Code != 401 {
		t.Fatalf("expired: %d", w.Code)
	}
	if w := hs.do("GET", "/api/me", nil, &http.Cookie{Name: "__Host-sid", Value: "garbage"}); w.Code != 401 {
		t.Fatalf("garbage cookie: %d", w.Code)
	}
}

func TestCrossSitePostRejected(t *testing.T) {
	hs := newHarness(t)
	c := hs.login("a@example.com", audApp)
	r := httptest.NewRequest("POST", "/api/waitlist", strings.NewReader("{}"))
	r.Header.Set("Sec-Fetch-Site", "cross-site")
	r.Header.Set("Origin", "https://evil.example")
	r.AddCookie(c)
	w := httptest.NewRecorder()
	hs.h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("cross-site POST: %d", w.Code)
	}
}

func TestAdminRoutesLocked(t *testing.T) {
	hs := newHarness(t)
	appCookie := hs.login("admin@example.com", audApp) // allowlisted email, but an app session
	exAdmin := hs.login("former@example.com", audAdmin)
	for pattern := range hs.s.adminRoutes() {
		method, path, _ := strings.Cut(pattern, " ")
		path = strings.ReplaceAll(path, "{id}", "00000000-0000-0000-0000-000000000000")
		for name, c := range map[string]*http.Cookie{"none": nil, "app session": appCookie} {
			if w := hs.do(method, path, map[string]any{}, c); w.Code != 401 {
				t.Errorf("%s with %s: %d", pattern, name, w.Code)
			}
		}
		// an admin session whose email is no longer on the allowlist
		if w := hs.do(method, path, map[string]any{}, &http.Cookie{Name: "__Host-asid", Value: exAdmin.Value}); w.Code != 403 {
			t.Errorf("%s with removed admin: %d", pattern, w.Code)
		}
	}
}

// oidcLogin runs start → stub Google → callback and returns the callback response.
func (hs *harness) oidcLogin(prefix string, claims func(nonce string) map[string]any) *httptest.ResponseRecorder {
	hs.t.Helper()
	w := hs.do("GET", prefix+"/google/start?return_to=/app/x", nil, nil)
	if w.Code != 302 {
		hs.t.Fatalf("start: %d", w.Code)
	}
	loc, _ := url.Parse(w.Header().Get("Location"))
	q := loc.Query()
	if q.Get("code_challenge_method") != "S256" || q.Get("nonce") == "" {
		hs.t.Fatalf("auth url: %s", loc)
	}
	hs.mu.Lock()
	hs.claims = claims(q.Get("nonce"))
	hs.mu.Unlock()
	return hs.do("GET", prefix+"/google/callback?code=c&state="+url.QueryEscape(q.Get("state")), nil, w.Result().Cookies()[0])
}

func TestOIDCCallback(t *testing.T) {
	hs := newHarness(t)
	good := func(email string) func(string) map[string]any {
		return func(nonce string) map[string]any {
			return map[string]any{"iss": "https://accounts.google.com", "aud": "client-1", "exp": time.Now().Add(time.Hour).Unix(),
				"nonce": nonce, "sub": "g-" + email, "email": email, "email_verified": true, "name": "Ramesh"}
		}
	}
	with := func(k string, v any) func(string) map[string]any {
		return func(nonce string) map[string]any {
			c := good("x@example.com")(nonce)
			c[k] = v
			return c
		}
	}
	w := hs.oidcLogin("/api/auth", good("owner@example.com"))
	if w.Code != 302 || w.Header().Get("Location") != "/app/x" {
		t.Fatalf("good login: %d %s", w.Code, w.Header().Get("Location"))
	}
	var sid *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == "__Host-sid" {
			sid = c
		}
	}
	if sid == nil || !sid.HttpOnly || !sid.Secure || sid.SameSite != http.SameSiteLaxMode {
		t.Fatalf("session cookie: %+v", sid)
	}
	if w := hs.do("GET", "/api/me", nil, sid); w.Code != 200 || !strings.Contains(w.Body.String(), "owner@example.com") {
		t.Fatalf("me: %d %s", w.Code, w.Body)
	}

	for name, claims := range map[string]func(string) map[string]any{
		"bad nonce":      with("nonce", "nope"),
		"unverified":     with("email_verified", false),
		"wrong aud":      with("aud", "someone-else"),
		"expired token":  with("exp", time.Now().Add(-time.Minute).Unix()),
		"wrong issuer":   with("iss", "https://evil.example"),
		"non-admin user": good("owner@example.com"),
	} {
		prefix := "/api/auth"
		if name == "non-admin user" {
			prefix = "/api/admin/auth"
		}
		w := hs.oidcLogin(prefix, claims)
		if loc := w.Header().Get("Location"); w.Code != 302 || !strings.Contains(loc, "error=") {
			t.Errorf("%s: %d %s", name, w.Code, loc)
		}
		for _, c := range w.Result().Cookies() {
			if strings.HasSuffix(c.Name, "sid") && c.MaxAge > 0 {
				t.Errorf("%s: session cookie set", name)
			}
		}
	}

	w = hs.oidcLogin("/api/admin/auth", good("admin@example.com"))
	if w.Header().Get("Location") != "/app/x" { // return_to honoured for admin too
		t.Fatalf("admin login: %s", w.Header().Get("Location"))
	}
	w = hs.do("GET", "/api/auth/google/start?return_to=//evil.example", nil, nil)
	b, _ := base64.RawURLEncoding.DecodeString(w.Result().Cookies()[0].Value)
	var st oauthState
	if err := json.Unmarshal(b, &st); err != nil || st.ReturnTo != "/app" {
		t.Fatalf("open redirect: %+v %v", st, err)
	}
}
