use std::collections::HashMap;
use std::sync::Mutex;

use crate::error::OropisError;

const SERVICE_NAME: &str = "oropis";

pub trait KeychainBackend: Send + Sync {
    fn save(&self, provider: &str, key: &str) -> Result<(), OropisError>;
    fn load(&self, provider: &str) -> Result<Option<String>, OropisError>;
    fn delete(&self, provider: &str) -> Result<(), OropisError>;

    fn has(&self, provider: &str) -> Result<bool, OropisError> {
        Ok(self.load(provider)?.is_some())
    }
}

pub struct OsKeychainBackend;

impl OsKeychainBackend {
    fn entry(provider: &str) -> Result<keyring::Entry, OropisError> {
        keyring::Entry::new(SERVICE_NAME, provider)
            .map_err(|e| OropisError::KeychainError(e.to_string()))
    }
}

impl KeychainBackend for OsKeychainBackend {
    fn save(&self, provider: &str, key: &str) -> Result<(), OropisError> {
        Self::entry(provider)?
            .set_password(key)
            .map_err(|e| OropisError::KeychainError(e.to_string()))
    }

    fn load(&self, provider: &str) -> Result<Option<String>, OropisError> {
        match Self::entry(provider)?.get_password() {
            Ok(key) => Ok(Some(key)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(OropisError::KeychainError(e.to_string())),
        }
    }

    fn delete(&self, provider: &str) -> Result<(), OropisError> {
        match Self::entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(OropisError::KeychainError(e.to_string())),
        }
    }
}

pub struct MockKeychainBackend {
    store: Mutex<HashMap<String, String>>,
}

impl MockKeychainBackend {
    pub fn new() -> Self {
        Self {
            store: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for MockKeychainBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl KeychainBackend for MockKeychainBackend {
    fn save(&self, provider: &str, key: &str) -> Result<(), OropisError> {
        self.store
            .lock()
            .unwrap()
            .insert(provider.to_string(), key.to_string());
        Ok(())
    }

    fn load(&self, provider: &str) -> Result<Option<String>, OropisError> {
        Ok(self.store.lock().unwrap().get(provider).cloned())
    }

    fn delete(&self, provider: &str) -> Result<(), OropisError> {
        self.store.lock().unwrap().remove(provider);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mock_save_load_roundtrip() {
        let backend = MockKeychainBackend::new();
        backend.save("openai", "sk-test-123").unwrap();
        assert_eq!(backend.load("openai").unwrap(), Some("sk-test-123".into()));
    }

    #[test]
    fn test_mock_load_missing_returns_none() {
        let backend = MockKeychainBackend::new();
        assert_eq!(backend.load("anthropic").unwrap(), None);
    }

    #[test]
    fn test_mock_overwrite() {
        let backend = MockKeychainBackend::new();
        backend.save("openai", "sk-old").unwrap();
        backend.save("openai", "sk-new").unwrap();
        assert_eq!(backend.load("openai").unwrap(), Some("sk-new".into()));
    }

    #[test]
    fn test_mock_delete() {
        let backend = MockKeychainBackend::new();
        backend.save("openai", "sk-test").unwrap();
        backend.delete("openai").unwrap();
        assert!(!backend.has("openai").unwrap());
    }

    #[test]
    fn test_mock_delete_missing_is_ok() {
        let backend = MockKeychainBackend::new();
        assert!(backend.delete("nonexistent").is_ok());
    }

    #[test]
    fn test_mock_providers_isolated() {
        let backend = MockKeychainBackend::new();
        backend.save("openai", "sk-openai").unwrap();
        backend.save("anthropic", "sk-anthropic").unwrap();
        backend.delete("openai").unwrap();
        assert_eq!(backend.load("openai").unwrap(), None);
        assert_eq!(
            backend.load("anthropic").unwrap(),
            Some("sk-anthropic".into())
        );
    }
}
