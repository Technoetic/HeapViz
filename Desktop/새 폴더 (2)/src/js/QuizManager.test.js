/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname2 = dirname(fileURLToPath(import.meta.url));
const QuizManager = new Function(
	"document",
	readFileSync(resolve(__dirname2, "./QuizManager.js"), "utf8") +
		"\nreturn QuizManager;",
)(document);

describe("QuizManager", () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="quiz-container"></div>';
		vi.clearAllTimers();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("생성", () => {
		it("container 바인딩, questions 배열, currentQuestion 0, score 0으로 초기화해야 함", () => {
			const manager = new QuizManager("quiz-container");

			expect(manager.container).toBe(document.getElementById("quiz-container"));
			expect(Array.isArray(manager.questions)).toBe(true);
			expect(manager.currentQuestion).toBe(0);
			expect(manager.score).toBe(0);
			expect(manager.questions.length).toBeGreaterThan(0);
		});

		it("questions 배열에 각 질문마다 필요한 속성들이 있어야 함", () => {
			const manager = new QuizManager("quiz-container");

			manager.questions.forEach((q) => {
				expect(q).toHaveProperty("question");
				expect(q).toHaveProperty("options");
				expect(q).toHaveProperty("correctIndex");
				expect(q).toHaveProperty("hints");
				expect(q).toHaveProperty("explanation");
				expect(Array.isArray(q.options)).toBe(true);
				expect(Array.isArray(q.hints)).toBe(true);
			});
		});
	});

	describe("init()", () => {
		it("첫 문제를 렌더링해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.init();

			const questionDiv = document.querySelector(".quiz-question");
			expect(questionDiv).not.toBeNull();
			expect(questionDiv.textContent).toContain(manager.questions[0].question);
		});

		it("currentQuestion과 score를 0으로 리셋해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.currentQuestion = 2;
			manager.score = 3;

			manager.init();

			expect(manager.currentQuestion).toBe(0);
			expect(manager.score).toBe(0);
			expect(manager.hintLevel).toBe(0);
		});

		it("진행 상황 정보를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.init();

			const progress = document.querySelector(".quiz-progress");
			expect(progress).not.toBeNull();
			expect(progress.textContent).toBe(`질문 1 / ${manager.questions.length}`);
		});
	});

	describe("showQuestion() / render()", () => {
		it("문제 텍스트를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const questionDiv = document.querySelector(".quiz-question");
			expect(questionDiv).not.toBeNull();
			expect(questionDiv.textContent).toContain(manager.questions[0].question);
		});

		it("모든 선택지 버튼을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const optionButtons = document.querySelectorAll(".quiz-option-btn");
			expect(optionButtons.length).toBe(manager.questions[0].options.length);

			manager.questions[0].options.forEach((opt, idx) => {
				expect(optionButtons[idx].textContent).toBe(opt);
			});
		});

		it("힌트 버튼을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const hintBtn = document.querySelector(".quiz-hint-btn");
			expect(hintBtn).not.toBeNull();
			expect(hintBtn.textContent).toContain("힌트");
		});

		it("현재 문제 인덱스를 업데이트해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(1);

			expect(manager.currentQuestion).toBe(1);
		});

		it("hintLevel을 0으로 리셋해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.hintLevel = 2;

			manager.render(1);

			expect(manager.hintLevel).toBe(0);
		});
	});

	describe("checkAnswer(정답)", () => {
		it("정답 선택 시 score를 증가시켜야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			expect(manager.score).toBe(0);

			manager.checkAnswer(correctIndex);

			expect(manager.score).toBe(1);
		});

		it("정답 피드백을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			manager.checkAnswer(correctIndex);

			const feedback = document.querySelector(".quiz-feedback.correct");
			expect(feedback).not.toBeNull();
			expect(feedback.textContent).toContain("✓");
			expect(feedback.textContent).toContain("정답");
		});

		it("정답 설명(explanation)을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			manager.checkAnswer(correctIndex);

			const feedback = document.querySelector(".quiz-feedback");
			expect(feedback.textContent).toContain(manager.questions[0].explanation);
		});

		it("정답 선택 후 다음 버튼을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			manager.checkAnswer(correctIndex);

			vi.advanceTimersByTime(100);

			const nextBtn = document.querySelector(".quiz-next-btn");
			expect(nextBtn).not.toBeNull();
		});
	});

	describe("checkAnswer(오답)", () => {
		it("오답 선택 시 score를 유지해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);
			manager.score = 5;

			const correctIndex = manager.questions[0].correctIndex;
			const wrongIndex = correctIndex === 0 ? 1 : 0;

			manager.checkAnswer(wrongIndex);

			expect(manager.score).toBe(5);
		});

		it("오답 피드백을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			const wrongIndex = correctIndex === 0 ? 1 : 0;

			manager.checkAnswer(wrongIndex);

			const feedback = document.querySelector(".quiz-feedback.incorrect");
			expect(feedback).not.toBeNull();
			expect(feedback.textContent).toContain("✗");
			expect(feedback.textContent).toContain("틀렸");
		});

		it("오답 설명(explanation)을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			const wrongIndex = correctIndex === 0 ? 1 : 0;

			manager.checkAnswer(wrongIndex);

			const feedback = document.querySelector(".quiz-feedback");
			expect(feedback.textContent).toContain(manager.questions[0].explanation);
		});

		it("오답 선택 후 다음 버튼을 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const correctIndex = manager.questions[0].correctIndex;
			const wrongIndex = correctIndex === 0 ? 1 : 0;

			manager.checkAnswer(wrongIndex);

			vi.advanceTimersByTime(100);

			const nextBtn = document.querySelector(".quiz-next-btn");
			expect(nextBtn).not.toBeNull();
		});

		it("여러 문제 중 일부만 정답할 경우 정확한 점수를 유지해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.init();

			// 첫 번째 문제 - 정답
			manager.checkAnswer(manager.questions[0].correctIndex);
			expect(manager.score).toBe(1);

			vi.advanceTimersByTime(100);

			// 다음 문제로 이동
			const nextBtn = document.querySelector(".quiz-next-btn");
			nextBtn.click();

			vi.advanceTimersByTime(100);

			// 두 번째 문제 - 오답
			const q1CorrectIndex = manager.questions[1].correctIndex;
			const wrongIndex = q1CorrectIndex === 0 ? 1 : 0;
			manager.checkAnswer(wrongIndex);
			expect(manager.score).toBe(1);
		});
	});

	describe("nextQuestion() / 다음 문제로 이동", () => {
		it("다음 문제를 렌더링해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			manager.checkAnswer(manager.questions[0].correctIndex);
			vi.advanceTimersByTime(100);

			const nextBtn = document.querySelector(".quiz-next-btn");
			nextBtn.click();

			vi.advanceTimersByTime(100);

			const questionDiv = document.querySelector(".quiz-question");
			expect(questionDiv.textContent).toContain(manager.questions[1].question);
		});

		it("currentQuestion을 증가시켜야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			expect(manager.currentQuestion).toBe(0);

			manager.checkAnswer(manager.questions[0].correctIndex);
			vi.advanceTimersByTime(100);

			const nextBtn = document.querySelector(".quiz-next-btn");
			nextBtn.click();

			vi.advanceTimersByTime(100);

			expect(manager.currentQuestion).toBe(1);
		});

		it("마지막 문제 다음에는 결과를 보여야 함", () => {
			const manager = new QuizManager("quiz-container");
			const lastQuestionIndex = manager.questions.length - 1;
			manager.render(lastQuestionIndex);

			manager.checkAnswer(manager.questions[lastQuestionIndex].correctIndex);
			vi.advanceTimersByTime(100);

			const nextBtn = document.querySelector(".quiz-next-btn");
			expect(nextBtn.textContent).toContain("결과 보기");

			nextBtn.click();

			vi.advanceTimersByTime(100);

			const results = document.querySelector(".quiz-results");
			expect(results).not.toBeNull();
		});
	});

	describe("showResults()", () => {
		it("최종 점수를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.score = 3;
			manager.showResults();

			const scoreDisplay = document.querySelector(".quiz-score");
			expect(scoreDisplay).not.toBeNull();
			expect(scoreDisplay.textContent).toContain("3");
			expect(scoreDisplay.textContent).toContain(
				String(manager.questions.length),
			);
		});

		it("완벽한 점수일 때 축하 메시지를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.score = manager.questions.length;
			manager.showResults();

			const message = document.querySelector(".quiz-message");
			expect(message).not.toBeNull();
			expect(message.textContent).toContain("완벽");
		});

		it("불완벽한 점수일 때 재도전 메시지를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.score = 2;
			manager.showResults();

			const message = document.querySelector(".quiz-message");
			expect(message).not.toBeNull();
			expect(message.textContent).toContain("좋은 시도");
		});

		it("제로 점수일 때도 결과를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.score = 0;
			manager.showResults();

			const results = document.querySelector(".quiz-results");
			expect(results).not.toBeNull();
			const scoreDisplay = document.querySelector(".quiz-score");
			expect(scoreDisplay.textContent).toContain("0");
		});
	});

	describe("통합 테스트", () => {
		it("전체 퀴즈 흐름을 완료할 수 있어야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.init();

			expect(manager.currentQuestion).toBe(0);
			expect(manager.score).toBe(0);

			// 모든 문제 순회
			for (let i = 0; i < manager.questions.length; i++) {
				const questionDiv = document.querySelector(".quiz-question");
				expect(questionDiv.textContent).toContain(
					manager.questions[i].question,
				);

				// 정답 선택
				manager.checkAnswer(manager.questions[i].correctIndex);
				expect(manager.score).toBe(i + 1);

				vi.advanceTimersByTime(100);

				// 다음 문제로 이동 (마지막이 아닌 경우)
				if (i < manager.questions.length - 1) {
					const nextBtn = document.querySelector(".quiz-next-btn");
					nextBtn.click();
					vi.advanceTimersByTime(100);
				}
			}

			// 마지막 문제 정답 후 다음 버튼 클릭 → 결과 표시
			const lastNextBtn = document.querySelector(".quiz-next-btn");
			if (lastNextBtn) {
				lastNextBtn.click();
				vi.advanceTimersByTime(100);
			}

			// 모든 문제를 정답한 후 결과 페이지 확인
			expect(manager.score).toBe(manager.questions.length);
		});

		it("섞인 정답/오답 시나리오를 처리해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.init();

			// 첫 번째: 정답
			manager.checkAnswer(manager.questions[0].correctIndex);
			expect(manager.score).toBe(1);
			vi.advanceTimersByTime(100);
			document.querySelector(".quiz-next-btn").click();
			vi.advanceTimersByTime(100);

			// 두 번째: 오답
			const q1CorrectIdx = manager.questions[1].correctIndex;
			const wrongIdx = q1CorrectIdx === 0 ? 1 : 0;
			manager.checkAnswer(wrongIdx);
			expect(manager.score).toBe(1);
			vi.advanceTimersByTime(100);
			document.querySelector(".quiz-next-btn").click();
			vi.advanceTimersByTime(100);

			// 세 번째: 정답
			if (manager.questions.length > 2) {
				manager.checkAnswer(manager.questions[2].correctIndex);
				expect(manager.score).toBe(2);
			}
		});
	});

	describe("힌트 기능", () => {
		it("힌트 버튼 클릭 시 첫 번째 힌트를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const hintBtn = document.querySelector(".quiz-hint-btn");
			hintBtn.click();

			const hint = document.querySelector(".quiz-hint");
			expect(hint).not.toBeNull();
			expect(hint.textContent).toBe(manager.questions[0].hints[0]);
		});

		it("여러 번 힌트 버튼을 클릭하면 순차적으로 다음 힌트를 표시해야 함", () => {
			const manager = new QuizManager("quiz-container");
			manager.render(0);

			const hintBtn = document.querySelector(".quiz-hint-btn");

			hintBtn.click();
			expect(manager.hintLevel).toBe(1);

			hintBtn.click();
			expect(manager.hintLevel).toBe(2);

			const hints = document.querySelectorAll(".quiz-hint");
			expect(hints.length).toBe(2);
		});
	});
});
