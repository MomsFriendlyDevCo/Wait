import {defineConfig, globalIgnores} from "eslint/config";
import RulesMFDC from '@momsfriendlydevco/eslint-config';

export default defineConfig([
	globalIgnores([
		'.*',
		'node_modules/',
	]),
	...RulesMFDC,
])
