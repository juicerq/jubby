import { describe, expect, it } from "bun:test";
import { MODEL_OPTIONS, type ModelId } from "../constants";

describe("MODEL_OPTIONS", () => {
	describe("structure validation", () => {
		it("should have at least one model option", () => {
			expect(MODEL_OPTIONS.length).toBeGreaterThan(0);
		});

		it("should have unique model ids", () => {
			const ids = MODEL_OPTIONS.map((option) => option.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it("should have non-empty labels for all models", () => {
			for (const option of MODEL_OPTIONS) {
				expect(option.label.trim().length).toBeGreaterThan(0);
			}
		});

		it("should have non-empty ids for all models", () => {
			for (const option of MODEL_OPTIONS) {
				expect(option.id.trim().length).toBeGreaterThan(0);
			}
		});
	});

	describe("expected model ids", () => {
		const expectedModelIds = [
			"openai/gpt-5.2-codex",
			"anthropic/claude-opus-4-5",
			"anthropic/claude-sonnet-4-5",
			"anthropic/claude-haiku-4-5",
		] as const;

		it("should contain all expected model ids", () => {
			const actualIds = MODEL_OPTIONS.map((option) => option.id);
			for (const expectedId of expectedModelIds) {
				expect(actualIds).toContain(expectedId);
			}
		});

		it("should not contain unexpected model ids", () => {
			const actualIds = MODEL_OPTIONS.map((option) => option.id);
			for (const actualId of actualIds) {
				expect(expectedModelIds).toContain(
					actualId as (typeof expectedModelIds)[number],
				);
			}
		});
	});

	describe("expected labels", () => {
		const expectedLabels = [
			{ id: "openai/gpt-5.2-codex" as const, label: "GPT-5.2 Codex" as const },
			{
				id: "anthropic/claude-opus-4-5" as const,
				label: "Opus 4.5" as const,
			},
			{
				id: "anthropic/claude-sonnet-4-5" as const,
				label: "Sonnet 4.5" as const,
			},
			{
				id: "anthropic/claude-haiku-4-5" as const,
				label: "Haiku 4.5" as const,
			},
		];

		it("should have correct labels for each model id", () => {
			for (const expected of expectedLabels) {
				const option = MODEL_OPTIONS.find((o) => o.id === expected.id);
				expect(option).toBeDefined();
				expect(option?.label).toBe(expected.label);
			}
		});
	});

	describe("ordering", () => {
		it("should have GPT-5.2 Codex as the first option (default/recommended)", () => {
			expect(MODEL_OPTIONS[0].id).toBe("openai/gpt-5.2-codex");
			expect(MODEL_OPTIONS[0].label).toBe("GPT-5.2 Codex");
		});

		it("should list Anthropic models after OpenAI in capability order (Opus > Sonnet > Haiku)", () => {
			const anthropicModels = MODEL_OPTIONS.filter((o) =>
				o.id.startsWith("anthropic/"),
			);
			expect(anthropicModels.length).toBe(3);
			expect(anthropicModels[0].id).toBe("anthropic/claude-opus-4-5");
			expect(anthropicModels[1].id).toBe("anthropic/claude-sonnet-4-5");
			expect(anthropicModels[2].id).toBe("anthropic/claude-haiku-4-5");
		});

		it("should maintain expected order for generate dropdown display", () => {
			const expectedOrder: ModelId[] = [
				"openai/gpt-5.2-codex",
				"anthropic/claude-opus-4-5",
				"anthropic/claude-sonnet-4-5",
				"anthropic/claude-haiku-4-5",
			];
			const actualOrder: ModelId[] = [...MODEL_OPTIONS.map((o) => o.id)];
			expect(actualOrder).toEqual(expectedOrder);
		});
	});

	describe("ModelId type", () => {
		it("should be assignable from MODEL_OPTIONS ids", () => {
			// Type check - if this compiles, the type is correct
			const testId: ModelId = MODEL_OPTIONS[0].id;
			expect(testId).toBe("openai/gpt-5.2-codex");
		});
	});
});
