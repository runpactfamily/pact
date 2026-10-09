// Imported first by every test file: isolates storage and silences logs
// before any server module reads its configuration.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.PACT_STORAGE = "memory";
process.env.PACT_LOG = "silent";
process.env.PACT_MODE = process.env.PACT_MODE ?? "development";
delete process.env.GEMINI_API_KEY;
delete process.env.TAVILY_API_KEY;
delete process.env.JINA_API_KEY;
delete process.env.GITHUB_TOKEN;
