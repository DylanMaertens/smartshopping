//! Single-operator administration. Disabled until credentials and a trusted HTTPS
//! origin are provisioned. Sessions and bounded diagnostics never persist secrets.
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub const COOKIE: &str = "__Host-poduna_admin";
pub const ABSOLUTE_TTL: u64 = 8 * 60 * 60;
const IDLE_TTL: u64 = 30 * 60;
const LOG_TTL: u64 = 24 * 60 * 60;
const LOG_CAPACITY: usize = 1000;

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Credentials {
    pub username: String,
    pub password_hash: String,
}

pub struct AdminState {
    credentials: Option<Credentials>,
    origin: String,
    origin_file: Option<PathBuf>,
    started: Instant,
    inner: Mutex<Inner>,
}
struct Inner {
    sessions: HashMap<String, Session>,
    login_window: Instant,
    login_attempts: u32,
    events: VecDeque<(Instant, Event)>,
    requests: u64,
    errors: u64,
    rejected: u64,
    duration_ms: u64,
}
struct Session {
    created: Instant,
    touched: Instant,
    csrf: String,
    origin: String,
}
#[derive(Clone, Serialize)]
pub struct Event {
    pub time: String,
    pub reference: String,
    pub level: &'static str,
    pub service: &'static str,
    pub route: &'static str,
    pub method: &'static str,
    pub status: u16,
    pub duration_ms: u64,
    pub code: &'static str,
}
#[derive(Serialize)]
pub struct Snapshot {
    pub uptime_seconds: u64,
    pub requests: u64,
    pub errors: u64,
    pub rejected: u64,
    pub mean_duration_ms: f64,
    pub retained_events: usize,
}

impl AdminState {
    pub fn operator(&self) -> Option<&str> {
        self.credentials.as_ref().map(|c| c.username.as_str())
    }
    pub fn from_env() -> Self {
        let credentials = std::env::var("ADMIN_CREDENTIALS_FILE").ok().map(|path| {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let metadata =
                    std::fs::metadata(&path).expect("cannot inspect admin credentials file");
                assert!(
                    metadata.permissions().mode() & 0o077 == 0,
                    "admin credentials must not be accessible to group/others (chmod 600)"
                );
            }
            let bytes = std::fs::read(path).expect("cannot read admin credentials file");
            assert!(bytes.len() <= 4096, "admin credentials file too large");
            let credentials: Credentials =
                serde_json::from_slice(&bytes).expect("invalid admin credentials file");
            assert!(
                Self::valid_credentials(&credentials),
                "invalid admin credential format"
            );
            credentials
        });
        let mut admin = Self::new(
            credentials,
            std::env::var("ADMIN_ORIGIN").unwrap_or_default(),
        );
        admin.origin_file = std::env::var("ADMIN_ORIGIN_FILE").ok().map(PathBuf::from);
        admin
    }

    pub fn new(credentials: Option<Credentials>, origin: String) -> Self {
        Self {
            credentials,
            origin,
            origin_file: None,
            started: Instant::now(),
            inner: Mutex::new(Inner {
                sessions: HashMap::new(),
                login_window: Instant::now(),
                login_attempts: 0,
                events: VecDeque::new(),
                requests: 0,
                errors: 0,
                rejected: 0,
                duration_ms: 0,
            }),
        }
    }

    fn valid_credentials(value: &Credentials) -> bool {
        let Ok(hash) = PasswordHash::new(&value.password_hash) else {
            return false;
        };
        !value.username.is_empty()
            && value.username.len() <= 80
            && hash.algorithm.as_str() == "argon2id"
            && hash.params.get_decimal("m") == Some(19456)
            && hash.params.get_decimal("t") == Some(2)
            && hash.params.get_decimal("p") == Some(1)
            && hash.hash.is_some()
            && hash.salt.is_some()
    }

    pub fn enabled(&self) -> bool {
        self.credentials.is_some()
    }

    pub fn trusted_origin(&self) -> Option<String> {
        if !self.enabled() {
            return None;
        }
        let raw = match &self.origin_file {
            Some(path) => {
                if std::fs::metadata(path).ok()?.len() > 1024 {
                    return None;
                }
                std::fs::read_to_string(path).ok()?
            }
            None => self.origin.clone(),
        };
        let url = reqwest::Url::parse(raw.trim()).ok()?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || url.path() != "/"
        {
            return None;
        }
        Some(url.origin().ascii_serialization())
    }

    // Global single-account limiter; never trusts spoofable proxy/device headers.
    // Bounded even if an attacker changes IPs. A busy window may deny the owner too.
    pub fn allow_login(&self) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if inner.login_window.elapsed() >= Duration::from_secs(300) {
            inner.login_window = Instant::now();
            inner.login_attempts = 0;
        }
        if inner.login_attempts >= 10 {
            return false;
        }
        inner.login_attempts += 1;
        true
    }

    pub fn verify_password(&self, username: &str, password: &str) -> bool {
        let Some(credentials) = &self.credentials else {
            return false;
        };
        let Ok(hash) = PasswordHash::new(&credentials.password_hash) else {
            return false;
        };
        // Hash even an unknown username; do not expose a username enumeration path.
        let correct = Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok();
        correct && username == credentials.username
    }

    pub fn create_session(&self, origin: String, previous: Option<&str>) -> (String, String) {
        let token = random_token();
        let csrf = random_token();
        let mut inner = self.inner.lock().unwrap();
        if let Some(previous) = previous {
            inner.sessions.remove(&token_hash(previous));
        }
        inner.sessions.retain(|_, session| !expired(session));
        if inner.sessions.len() >= 8 {
            if let Some(oldest) = inner
                .sessions
                .iter()
                .min_by_key(|(_, s)| s.created)
                .map(|(key, _)| key.clone())
            {
                inner.sessions.remove(&oldest);
            }
        }
        inner.sessions.insert(
            token_hash(&token),
            Session {
                created: Instant::now(),
                touched: Instant::now(),
                csrf: csrf.clone(),
                origin,
            },
        );
        (token, csrf)
    }

    pub fn session(&self, token: &str, origin: &str) -> Option<String> {
        if token.len() != 64 || !token.bytes().all(|v| v.is_ascii_hexdigit()) {
            return None;
        }
        let mut inner = self.inner.lock().unwrap();
        inner.sessions.retain(|_, session| !expired(session));
        let session = inner.sessions.get_mut(&token_hash(token))?;
        if session.origin != origin {
            return None;
        }
        session.touched = Instant::now();
        Some(session.csrf.clone())
    }

    pub fn revoke(&self, token: &str) {
        self.inner
            .lock()
            .unwrap()
            .sessions
            .remove(&token_hash(token));
    }

    pub fn record(&self, event: Event) {
        let mut inner = self.inner.lock().unwrap();
        // Dashboard polling is not app traffic and must not drown out useful logs.
        if !event.route.starts_with("/admin") && !matches!(event.route, "/health" | "/metrics") {
            inner.requests += 1;
            inner.errors += u64::from(event.status >= 500);
            inner.rejected += u64::from((400..500).contains(&event.status));
            inner.duration_ms = inner.duration_ms.saturating_add(event.duration_ms);
        }
        if event.route.starts_with("/admin")
            && event.status < 400
            && !matches!(event.code, "ADMIN_LOGIN_OK" | "ADMIN_LOGOUT")
        {
            return;
        }
        if matches!(event.route, "/health" | "/metrics") && event.status < 400 {
            return;
        }
        prune(&mut inner.events);
        if inner.events.len() == LOG_CAPACITY {
            inner.events.pop_front();
        }
        inner.events.push_back((Instant::now(), event));
    }

    pub fn events(&self) -> Vec<Event> {
        let mut inner = self.inner.lock().unwrap();
        prune(&mut inner.events);
        inner
            .events
            .iter()
            .rev()
            .map(|(_, event)| event.clone())
            .collect()
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut inner = self.inner.lock().unwrap();
        prune(&mut inner.events);
        Snapshot {
            uptime_seconds: self.started.elapsed().as_secs(),
            requests: inner.requests,
            errors: inner.errors,
            rejected: inner.rejected,
            mean_duration_ms: if inner.requests == 0 {
                0.0
            } else {
                inner.duration_ms as f64 / inner.requests as f64
            },
            retained_events: inner.events.len(),
        }
    }
}
fn expired(session: &Session) -> bool {
    session.created.elapsed().as_secs() >= ABSOLUTE_TTL
        || session.touched.elapsed().as_secs() >= IDLE_TTL
}
fn prune(events: &mut VecDeque<(Instant, Event)>) {
    while events
        .front()
        .is_some_and(|(time, _)| time.elapsed().as_secs() >= LOG_TTL)
    {
        events.pop_front();
    }
}
fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn random_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sessions_expire_revoke_and_are_origin_bound() {
        let admin = AdminState::new(None, String::new());
        let (token, _) = admin.create_session("https://example.org".into(), None);
        assert!(admin.session(&token, "https://other.org").is_none());
        assert!(admin.session(&token, "https://example.org").is_some());
        admin
            .inner
            .lock()
            .unwrap()
            .sessions
            .get_mut(&token_hash(&token))
            .unwrap()
            .touched = Instant::now() - Duration::from_secs(IDLE_TTL);
        assert!(admin.session(&token, "https://example.org").is_none());
        let (token, _) = admin.create_session("https://example.org".into(), None);
        admin
            .inner
            .lock()
            .unwrap()
            .sessions
            .get_mut(&token_hash(&token))
            .unwrap()
            .created = Instant::now() - Duration::from_secs(ABSOLUTE_TTL);
        assert!(admin.session(&token, "https://example.org").is_none());
        let (token, _) = admin.create_session("https://example.org".into(), None);
        admin.revoke(&token);
        assert!(admin.session(&token, "https://example.org").is_none());
    }
    #[test]
    fn sessions_and_login_attempts_are_bounded() {
        let admin = AdminState::new(None, String::new());
        for _ in 0..20 {
            admin.create_session("https://example.org".into(), None);
        }
        assert_eq!(admin.inner.lock().unwrap().sessions.len(), 8);
        for _ in 0..10 {
            assert!(admin.allow_login());
        }
        assert!(!admin.allow_login());
    }
    #[test]
    fn trusted_origin_is_explicit_https_only_and_log_retention_is_bounded_in_time() {
        let credentials = Credentials {
            username: "test".into(),
            password_hash: String::new(),
        };
        for origin in [
            "http://localhost",
            "https://user:pass@example.org",
            "https://example.org/path",
            "https://example.org?key=secret",
            "https://example.org#hash",
            "null",
        ] {
            assert!(AdminState::new(Some(credentials.clone()), origin.into())
                .trusted_origin()
                .is_none());
        }
        assert_eq!(
            AdminState::new(Some(credentials), "https://example.org/".into())
                .trusted_origin()
                .as_deref(),
            Some("https://example.org")
        );
        let admin = AdminState::new(None, String::new());
        admin.record(Event {
            time: String::new(),
            reference: String::new(),
            level: "info",
            service: "api",
            route: "/other",
            method: "GET",
            status: 200,
            duration_ms: 0,
            code: "HTTP_OK",
        });
        admin.inner.lock().unwrap().events.front_mut().unwrap().0 =
            Instant::now() - Duration::from_secs(LOG_TTL);
        assert!(admin.events().is_empty());
    }
}
