import pkg from './package.json';
import {terser} from "rollup-plugin-terser";
import resolve from "rollup-plugin-node-resolve";
export default [
	{
		input: 'src/index.js',
		output: [
			{
				file: pkg.module,
				format: 'es',
				strict: true,
				file: 'main.js',
			},
		],
		plugins: [
			resolve(),
		],
	},
	{
		input: 'src/index.js',
		output: [
			{
				file: pkg.module,
				format: 'es',
				strict: true,
				file: 'main.min.js',
			},
		],
		plugins: [
			resolve(),
			terser({
				mangle: {
					module: true,
				},
			}),
		],
	},
];
