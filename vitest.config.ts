import { defineConfig } from 'vitest/config';

// Bundle tests build all 550 entries; a loaded CI machine needs more than the 5 s default.
export default defineConfig({
	test: { testTimeout: 120000, hookTimeout: 120000 },
});
