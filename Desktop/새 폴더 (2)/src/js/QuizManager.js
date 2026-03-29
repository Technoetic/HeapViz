// 퀴즈 관리
class QuizManager {
	constructor(containerId) {
		this.container = document.getElementById(containerId);
		this.currentQuestion = 0;
		this.score = 0;
		this.hintLevel = 0;
		this.questions = [
			{
				question:
					"배열 [2, 5, 8, 12, 16, 23, 38]에서 23을 찾을 때, 첫 번째 mid 값의 인덱스는?",
				options: ["2", "3", "4", "5"],
				correctIndex: 1,
				hints: [
					"배열 길이는 7, low=0, high=6",
					"mid = 0 + Math.floor((6-0)/2)",
					"mid = 0 + 3 = 3",
				],
				explanation: "첫 단계에서 low=0, high=6이므로 mid=3, arr[3]=12",
			},
			{
				question: "이진탐색의 가장 중요한 전제조건은?",
				options: [
					"배열이 작아야 함",
					"배열이 정렬되어 있어야 함",
					"배열의 모든 원소가 양수",
					"배열의 길이가 2의 배수",
				],
				correctIndex: 1,
				hints: [
					"범위를 반으로 나누려면 순서가 필요합니다",
					"정렬되지 않으면 left/right 판단 불가",
					"정렬(Sorted) - 이것이 핵심",
				],
				explanation:
					"정렬된 배열이어야만 left/right 선택이 올바른 결과를 보장합니다.",
			},
			{
				question: "1024개 원소에서 이진탐색 최악의 경우 비교 횟수는?",
				options: ["512", "256", "10", "1024"],
				correctIndex: 2,
				hints: ["2^10 = 1024", "log₂(1024) = ?", "2를 10번 곱하면 1024"],
				explanation:
					"log₂(1024) = 10. 매 단계마다 범위가 절반으로 줄어들므로 최대 10번 비교.",
			},
			{
				question:
					"배열 [3, 7, 11, 15, 18, 24, 29, 33]에서 arr[mid] < target일 때 다음 동작은?",
				options: ["high = mid - 1", "low = mid + 1", "mid = low", "return mid"],
				correctIndex: 1,
				hints: [
					"target이 더 크면 어느 쪽을 탐색?",
					"오른쪽(더 큰 값) 탐색 필요",
					"low를 mid 오른쪽으로 이동",
				],
				explanation:
					"arr[mid]가 target보다 작으면 target은 오른쪽 범위에 있으므로 low = mid + 1로 탐색 범위 축소.",
			},
		];
	}

	init() {
		this.currentQuestion = 0;
		this.score = 0;
		this.hintLevel = 0;
		this.render(0);
	}

	render(questionIndex) {
		if (questionIndex >= this.questions.length) {
			this.showResults();
			return;
		}

		this.currentQuestion = questionIndex;
		this.hintLevel = 0;
		const q = this.questions[questionIndex];

		this.container.innerHTML = "";

		// 질문
		const qDiv = document.createElement("div");
		qDiv.className = "quiz-question";

		// Safe DOM creation instead of innerHTML
		const qPara = document.createElement("p");
		qPara.textContent = q.question;
		qDiv.appendChild(qPara);

		this.container.appendChild(qDiv);

		// 선택지
		const optionsDiv = document.createElement("div");
		optionsDiv.className = "quiz-options";

		q.options.forEach((opt, idx) => {
			const btn = document.createElement("button");
			btn.className = "quiz-option-btn";
			btn.textContent = opt;
			btn.onclick = () => this.checkAnswer(idx);
			optionsDiv.appendChild(btn);
		});

		this.container.appendChild(optionsDiv);

		// 힌트 버튼
		const hintBtn = document.createElement("button");
		hintBtn.className = "quiz-hint-btn";
		hintBtn.textContent = "💡 힌트 보기";
		hintBtn.onclick = () => this.showHint();
		this.container.appendChild(hintBtn);

		// 진행 상황
		const progress = document.createElement("div");
		progress.className = "quiz-progress";
		progress.textContent = `질문 ${questionIndex + 1} / ${this.questions.length}`;
		this.container.appendChild(progress);
	}

	checkAnswer(selectedIndex) {
		const q = this.questions[this.currentQuestion];
		const isCorrect = selectedIndex === q.correctIndex;

		// 피드백
		const feedback = document.createElement("div");
		feedback.className = `quiz-feedback ${isCorrect ? "correct" : "incorrect"}`;

		// Safe DOM creation instead of innerHTML
		const resultPara = document.createElement("p");
		resultPara.textContent = isCorrect ? "✓ 정답입니다!" : "✗ 틀렸습니다.";
		feedback.appendChild(resultPara);

		const explanationPara = document.createElement("p");
		explanationPara.textContent = q.explanation;
		feedback.appendChild(explanationPara);

		const container = this.container;
		const existingFeedback = container.querySelector(".quiz-feedback");
		if (existingFeedback) existingFeedback.remove();
		container.appendChild(feedback);

		if (isCorrect) this.score++;

		// 다음 버튼
		setTimeout(() => {
			const nextBtn = document.createElement("button");
			nextBtn.className = "quiz-next-btn";
			nextBtn.textContent =
				this.currentQuestion < this.questions.length - 1
					? "다음 문제"
					: "결과 보기";
			nextBtn.onclick = () => this.render(this.currentQuestion + 1);
			container.appendChild(nextBtn);
		}, 100);
	}

	showHint() {
		const q = this.questions[this.currentQuestion];
		if (this.hintLevel < q.hints.length) {
			const hintDiv = document.createElement("div");
			hintDiv.className = "quiz-hint";
			hintDiv.textContent = q.hints[this.hintLevel];
			this.container.appendChild(hintDiv);
			this.hintLevel++;
		}
	}

	showResults() {
		this.container.innerHTML = "";

		// Safe DOM creation instead of innerHTML
		const resultsDiv = document.createElement("div");
		resultsDiv.className = "quiz-results";

		const heading = document.createElement("h3");
		heading.textContent = "최종 점수";
		resultsDiv.appendChild(heading);

		const scorePara = document.createElement("p");
		scorePara.className = "quiz-score";
		scorePara.textContent = `${this.score} / ${this.questions.length}`;
		resultsDiv.appendChild(scorePara);

		const messagePara = document.createElement("p");
		messagePara.className = "quiz-message";
		messagePara.textContent =
			this.score === this.questions.length
				? "완벽합니다! 🎉"
				: "좋은 시도입니다! 다시 한번 학습해보세요.";
		resultsDiv.appendChild(messagePara);

		this.container.appendChild(resultsDiv);
	}
}
