// Test bootstrap.
//
// `@workspace/db` throws at import time when DATABASE_URL is missing. Tests
// never connect to this database: every suite that touches persistence mocks
// `@workspace/db`. A synthetic URL keeps module loading side-effect free while
// guaranteeing that no real credentials are ever read from the environment.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/medai_test";
process.env.NODE_ENV = "test";

// Never allow a developer's real provider key to leak into automated tests.
delete process.env.GROQ_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.DEV_AUTH_USER_ID;
