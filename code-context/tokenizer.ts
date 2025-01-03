import { AutoTokenizer, env } from "@huggingface/transformers";

// Configure the transformers environment
env.cacheDir = './.cache';

export const TOKENIZER_OPTIONS = {
	"Xenova/gpt-4": "gpt-4 / gpt-3.5-turbo / text-embedding-ada-002",
	"Xenova/text-davinci-003": "text-davinci-003 / text-davinci-002",
	"Xenova/gpt-3": "gpt-3",
	"Xenova/grok-1-tokenizer": "Grok-1",
	"Xenova/claude-tokenizer": "Claude",
	"Xenova/mistral-tokenizer-v3": "Mistral v3",
	"Xenova/mistral-tokenizer-v1": "Mistral v1",
	"Xenova/gemma-tokenizer": "Gemma",
	"Xenova/llama-3-tokenizer": "Llama 3",
	"Xenova/llama-tokenizer": "LLaMA / Llama 2",
	"Xenova/c4ai-command-r-v01-tokenizer": "Cohere Command-R",
	"Xenova/t5-small": "T5",
	"Xenova/bert-base-cased": "bert-base-cased",
} as const;

export type TokenizerModel = keyof typeof TOKENIZER_OPTIONS;

const DEFAULT_MODEL: TokenizerModel = "Xenova/claude-tokenizer";

// Use WeakMap to allow better garbage collection
const tokenizerCache = new WeakMap<object, any>();
const cacheKey = {};

export async function tokenize(text: string, model: TokenizerModel = DEFAULT_MODEL): Promise<{
	tokenCount: number;
}> {
	try {
		if (!tokenizerCache.has(cacheKey)) {
			console.error(`Loading tokenizer for model: ${model} (${TOKENIZER_OPTIONS[model]})`);
			const tokenizer = await AutoTokenizer.from_pretrained(model);
			tokenizerCache.set(cacheKey, tokenizer);
		}

		const tokenizer = tokenizerCache.get(cacheKey);
		if (!tokenizer) {
			throw new Error('Failed to initialize tokenizer');
		}

		const encodedOutput = await Promise.resolve(tokenizer.encode(text));

		// Handle both array-like objects and actual arrays
		const tokens = Array.isArray(encodedOutput) ? encodedOutput : Array.from(encodedOutput);

		return {
			tokenCount: tokens.length,
		};
	} catch (error) {
		console.error(
			`Error tokenizing with model ${model}:`,
			error instanceof Error ? error.message : error
		);
		throw error;
	}
}
