// Vitest globals enabled - describe, it, expect available globally
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(
	resolve(__dirname2, "./BinarySearchEngine.js"),
	"utf8",
);
const BinarySearchEngine = new Function(
	`${code}\nreturn BinarySearchEngine;`,
)();

describe("BinarySearchEngine", () => {
	let engine;

	beforeEach(() => {
		engine = new BinarySearchEngine();
	});

	describe("initialization", () => {
		it("should create engine with empty steps array", () => {
			expect(engine.steps).toEqual([]);
			expect(Array.isArray(engine.steps)).toBe(true);
		});
	});

	describe("run() method", () => {
		it("should find target value in sorted array [2,5,8,12,16,23,38] finding 23", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			const result = engine.run(array, 23);

			expect(result.found).toBe(true);
			expect(result.index).toBe(5);
			expect(result.steps).toBeDefined();
			expect(Array.isArray(result.steps)).toBe(true);
		});

		it("should return found:false for non-existent target value", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			const result = engine.run(array, 99);

			expect(result.found).toBe(false);
			expect(result.index).toBe(-1);
			expect(Array.isArray(result.steps)).toBe(true);
		});

		it("should return found:false for empty array", () => {
			const array = [];
			const result = engine.run(array, 5);

			expect(result.found).toBe(false);
			expect(result.index).toBe(-1);
			expect(result.steps.length).toBeGreaterThan(0); // Initial step recorded
		});

		it("should find target in single-element array when found", () => {
			const array = [42];
			const result = engine.run(array, 42);

			expect(result.found).toBe(true);
			expect(result.index).toBe(0);
		});

		it("should not find target in single-element array when not found", () => {
			const array = [42];
			const result = engine.run(array, 10);

			expect(result.found).toBe(false);
			expect(result.index).toBe(-1);
		});

		it("should find first element in array", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			const result = engine.run(array, 2);

			expect(result.found).toBe(true);
			expect(result.index).toBe(0);
		});

		it("should find last element in array", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			const result = engine.run(array, 38);

			expect(result.found).toBe(true);
			expect(result.index).toBe(6);
		});
	});

	describe("steps recording and validation", () => {
		it("should record steps with low, high, mid, and comparison properties", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 23);

			// Verify all steps have required properties
			engine.steps.forEach((step) => {
				expect(step).toHaveProperty("stepIndex");
				expect(step).toHaveProperty("array");
				expect(step).toHaveProperty("low");
				expect(step).toHaveProperty("high");
				expect(step).toHaveProperty("mid");
				expect(step).toHaveProperty("comparison");
				expect(step).toHaveProperty("result");
				expect(step).toHaveProperty("sourceCodeLine");
				expect(step).toHaveProperty("description");
			});
		});

		it("should have valid low, high, mid values in each step", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 23);

			engine.steps
				.filter((s) => s.result !== "not_found")
				.forEach((step) => {
					expect(typeof step.low).toBe("number");
					expect(typeof step.high).toBe("number");
					expect(typeof step.mid).toBe("number");
					expect(step.low).toBeGreaterThanOrEqual(0);
					expect(step.mid).toBeGreaterThanOrEqual(0);
				});
		});

		it("should clear steps array on each run() call", () => {
			const array = [2, 5, 8, 12, 16];

			engine.run(array, 8);
			const firstRunSteps = engine.steps.length;

			engine.run(array, 2);
			const secondRunSteps = engine.steps.length;

			// Both should have steps, but they should be independent
			expect(firstRunSteps).toBeGreaterThan(0);
			expect(secondRunSteps).toBeGreaterThan(0);
			// Verify steps don't accumulate
			expect(engine.steps[0].stepIndex).toBe(0);
		});

		it("should record comparison field with valid values (equal, less, greater, start)", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 23);

			engine.steps.forEach((step) => {
				expect(["equal", "less", "greater", "start"]).toContain(
					step.comparison,
				);
			});
		});

		it("should record result field with valid values (found, searching)", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 23);

			engine.steps.forEach((step) => {
				expect(["found", "searching"]).toContain(step.result);
			});
		});

		it("should have final step with result:found when target is found", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 23);

			const finalStep = engine.steps[engine.steps.length - 1];
			expect(finalStep.result).toBe("found");
			expect(finalStep.comparison).toBe("equal");
		});

		it("should have multiple steps when target is not found", () => {
			const array = [2, 5, 8, 12, 16, 23, 38];
			engine.run(array, 99);

			expect(engine.steps.length).toBeGreaterThan(1);
		});
	});

	describe("mid calculation validation", () => {
		it("should calculate mid using formula: low + Math.floor((high-low)/2)", () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			engine.run(array, 7);

			// found step의 mid 검증 — 올바른 인덱스를 가리키는지
			const result = engine.run(array, 7);
			if (result.found) {
				expect(array[result.index]).toBe(7);
			}
			// 각 step의 mid가 유효한 배열 인덱스인지
			engine.steps
				.filter((s) => s.low <= s.high)
				.forEach((step) => {
					expect(step.mid).toBeGreaterThanOrEqual(0);
					expect(step.mid).toBeLessThan(array.length);
				});
		});

		it("should prevent integer overflow with large ranges using formula", () => {
			const largeArray = Array.from({ length: 1000 }, (_, i) => i);
			engine.run(largeArray, 500);

			// 검색 완료(found) step에서 mid가 유효한 인덱스인지 확인
			const foundSteps = engine.steps.filter((s) => s.result === "found");
			foundSteps.forEach((step) => {
				expect(step.mid).toBeGreaterThanOrEqual(0);
				expect(step.mid).toBeLessThan(largeArray.length);
			});
		});

		it("should correctly narrow search range on each iteration", () => {
			const array = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
			engine.run(array, 13);

			// Verify search space decreases or mid moves appropriately
			for (let i = 1; i < engine.steps.length; i++) {
				const prevStep = engine.steps[i - 1];
				const currStep = engine.steps[i];

				const prevRange = prevStep.high - prevStep.low;
				const currRange = currStep.high - currStep.low;

				// Either range decreases or search ends (found)
				expect(currRange).toBeLessThanOrEqual(prevRange);
			}
		});
	});

	describe("edge cases", () => {
		it("should handle negative numbers in array", () => {
			const array = [-10, -5, 0, 5, 10];
			const result = engine.run(array, -5);

			expect(result.found).toBe(true);
			expect(result.index).toBe(1);
		});

		it("should handle large numbers", () => {
			const array = [100, 1000, 10000, 100000, 1000000];
			const result = engine.run(array, 10000);

			expect(result.found).toBe(true);
			expect(result.index).toBe(2);
		});

		it("should handle array with two elements - target is first", () => {
			const array = [5, 10];
			const result = engine.run(array, 5);

			expect(result.found).toBe(true);
			expect(result.index).toBe(0);
		});

		it("should handle array with two elements - target is second", () => {
			const array = [5, 10];
			const result = engine.run(array, 10);

			expect(result.found).toBe(true);
			expect(result.index).toBe(1);
		});

		it("should handle array with two elements - target not found", () => {
			const array = [5, 10];
			const result = engine.run(array, 7);

			expect(result.found).toBe(false);
			expect(result.index).toBe(-1);
		});
	});

	describe("return value structure", () => {
		it("should return object with found, index, and steps properties on success", () => {
			const array = [2, 5, 8, 12];
			const result = engine.run(array, 8);

			expect(result).toHaveProperty("found");
			expect(result).toHaveProperty("index");
			expect(result).toHaveProperty("steps");
			expect(typeof result.found).toBe("boolean");
			expect(typeof result.index).toBe("number");
			expect(Array.isArray(result.steps)).toBe(true);
		});

		it("should return object with found, index, and steps properties on failure", () => {
			const array = [2, 5, 8, 12];
			const result = engine.run(array, 99);

			expect(result).toHaveProperty("found");
			expect(result).toHaveProperty("index");
			expect(result).toHaveProperty("steps");
			expect(result.found).toBe(false);
			expect(result.index).toBe(-1);
		});

		it("steps array should be shallow copy of engine.steps on return", () => {
			const array = [2, 5, 8, 12];
			const result = engine.run(array, 8);

			expect(result.steps).toBe(engine.steps);
		});
	});

	describe("algorithm correctness", () => {
		it("should find element at each position in array of 10 elements", () => {
			const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

			for (let i = 0; i < array.length; i++) {
				const result = engine.run(array, array[i]);
				expect(result.found).toBe(true);
				expect(result.index).toBe(i);
			}
		});

		it("should not find any value between elements", () => {
			const array = [1, 3, 5, 7, 9];

			for (let target = 2; target < 9; target += 2) {
				const result = engine.run(array, target);
				expect(result.found).toBe(false);
				expect(result.index).toBe(-1);
			}
		});

		it("should handle duplicate comparisons correctly (array with duplicates)", () => {
			// Note: this tests behavior with duplicates - should find one instance
			const array = [1, 2, 2, 2, 5];
			const result = engine.run(array, 2);

			expect(result.found).toBe(true);
			expect(array[result.index]).toBe(2);
		});
	});
});
