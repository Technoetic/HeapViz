// 메인 앱 클래스
class App {
	static instance = null;

	constructor() {
		if (App.instance) return App.instance;

		this.engine = null;
		this.visualizer = null;
		this.codePanel = null;
		this.controller = null;
		this.quiz = null;

		// 최소 3단계 보장될 때까지 배열/타겟 재생성
		do {
			this.currentArray = this._generateRandomArray();
			this.currentTarget = this._pickRandomTarget(this.currentArray);
		} while (new BinarySearchEngine().run(this.currentArray, this.currentTarget).steps.length < 3);
		this.currentMode = "iterative";
		this.currentSection = "concept";
		this.theme = localStorage.getItem("binarySearchTheme") || "dark";

		App.instance = this;
	}

	init() {
		// 테마 적용
		document.documentElement.setAttribute("data-theme", this.theme);
		this.updateThemeIcon();

		// 컴포넌트 초기화 (HTML의 실제 ID: array-bars, code-content)
		this.visualizer = new Visualizer("array-bars");
		this.codePanel = new CodePanel("code-content");
		this.quiz = new QuizManager("quiz-container");

		// 이벤트 바인딩
		this.bindSectionButtons();
		this.bindControlButtons();
		this.bindKeyboard();

		// 테마 토글
		const themeToggle = document.getElementById("theme-toggle");
		if (themeToggle) {
			themeToggle.addEventListener("click", () => this.toggleTheme());
		}

		// 시작하기 버튼 → 시각화 섹션으로 이동
		const startBtn = document.getElementById("start-btn");
		if (startBtn) {
			startBtn.addEventListener("click", () =>
				this.switchToSection("visualizer"),
			);
		}

		// footer 버튼 바인딩
		const prevFooter = document.getElementById("prev-btn-footer");
		const playFooter = document.getElementById("play-btn-footer");
		const nextFooter = document.getElementById("next-btn-footer");
		const resetFooter = document.getElementById("reset-btn-footer");
		const speedFooter = document.getElementById("speed-slider-footer");
		const quizFooter = document.getElementById("quiz-btn-footer");

		if (prevFooter)
			prevFooter.addEventListener("click", () => this.onPrevClick());
		if (playFooter)
			playFooter.addEventListener("click", () => {
				this.onPlayPauseClick();
				const btn = document.getElementById("play-btn-footer");
				if (btn && this.controller)
					btn.textContent = this.controller.isPlaying ? "⏸" : "▶";
			});
		if (nextFooter)
			nextFooter.addEventListener("click", () => this.onNextClick());
		if (resetFooter)
			resetFooter.addEventListener("click", () => this.onResetClick());
		if (speedFooter)
			speedFooter.addEventListener("input", (e) =>
				this.onSpeedChange(e.target.value),
			);
		if (quizFooter)
			quizFooter.addEventListener("click", () => this.switchToSection("quiz"));

		// 바로 시각화 섹션으로 시작 (설명 페이지 스킵)
		this.switchToSection("visualizer");
	}

	bindSectionButtons() {
		const sectionBtns = document.querySelectorAll("[data-section]");
		sectionBtns.forEach((btn) => {
			btn.addEventListener("click", () => {
				const sectionId = btn.getAttribute("data-section");
				this.switchToSection(sectionId);
			});
		});
	}

	bindControlButtons() {
		// HTML ID: play-btn (not play-pause-btn)
		const playPauseBtn =
			document.getElementById("play-btn") ||
			document.getElementById("play-pause-btn");
		const nextBtn = document.getElementById("next-btn");
		const prevBtn = document.getElementById("prev-btn");
		const resetBtn = document.getElementById("reset-btn");
		const speedSlider = document.getElementById("speed-slider");

		if (playPauseBtn)
			playPauseBtn.addEventListener("click", () => this.onPlayPauseClick());
		if (nextBtn) nextBtn.addEventListener("click", () => this.onNextClick());
		if (prevBtn) prevBtn.addEventListener("click", () => this.onPrevClick());
		if (resetBtn) resetBtn.addEventListener("click", () => this.onResetClick());
		if (speedSlider)
			speedSlider.addEventListener("input", (e) =>
				this.onSpeedChange(e.target.value),
			);
	}

	bindKeyboard() {
		document.addEventListener("keydown", (e) => {
			if (!this.controller) return;
			// 수식키(Ctrl, Alt, Meta)가 눌려있으면 브라우저 기본 동작 허용
			if (e.ctrlKey || e.altKey || e.metaKey) return;

			switch (e.code) {
				case "Space":
					e.preventDefault();
					this.onPlayPauseClick();
					break;
				case "ArrowRight":
					e.preventDefault();
					this.onNextClick();
					break;
				case "ArrowLeft":
					e.preventDefault();
					this.onPrevClick();
					break;
				case "KeyR":
					e.preventDefault();
					this.onResetClick();
					break;
				case "KeyT":
					e.preventDefault();
					this.toggleTheme();
					break;
			}
		});
	}

	switchToSection(sectionId) {
		// 모든 섹션 숨김
		document.querySelectorAll(".section").forEach((sec) => {
			sec.classList.remove("active");
		});

		// 선택 섹션 표시 (ID 별칭 처리: concept → intro, visualizer → visualization)
		const idMap = { concept: "intro", visualizer: "visualization" };
		const resolvedId = idMap[sectionId] || sectionId;
		const section = document.getElementById(resolvedId);
		if (section) {
			section.classList.add("active");
			// currentSection은 정규화된 키(concept/visualizer/…)로 유지
			this.currentSection = sectionId;
			this.updateProgressBar();

			// 섹션별 초기화
			if (sectionId === "visualizer") {
				this.startVisualization(this.currentArray, this.currentTarget);
			} else if (sectionId === "code") {
				this.codePanel.init();
			} else if (sectionId === "quiz") {
				this.quiz.init();
			}
		}
	}

	startVisualization(array, target) {
		this.engine = new BinarySearchEngine();
		const result = this.engine.run(array, target);

		// 찾는 값 표시
		const targetLabel = document.getElementById("search-target");
		if (targetLabel) {
			targetLabel.textContent = "";
			targetLabel.appendChild(document.createTextNode("찾는 값: "));
			const strong = document.createElement("strong");
			strong.textContent = target;
			targetLabel.appendChild(strong);
		}

		this.visualizer.init(array);
		this.codePanel.init();
		this.controller = new AnimationController(result.steps, (step) =>
			this.onStepChange(step),
		);
		this.controller.reset();
		// 첫 단계 즉시 표시
		if (result.steps.length > 0) {
			this.onStepChange(result.steps[0]);
		}
	}

	onStepChange(step) {
		this.visualizer.update(step);
		this.codePanel.highlightLine(step.sourceCodeLine);

		// 설명 업데이트 (HTML ID: info-panel 또는 step-desc)
		const descDiv =
			document.getElementById("step-desc") ||
			document.getElementById("info-panel");
		if (descDiv) {
			descDiv.textContent = step.description;
		}

		// 단계 표시 (footer의 step-counter-footer 포함)
		const totalSteps = this.controller.steps.length;
		const stepText = `단계 ${step.stepIndex + 1} / ${totalSteps}`;
		const stepCountDiv = document.getElementById("step-count");
		if (stepCountDiv) {
			stepCountDiv.textContent = stepText;
		}
		const stepCounterFooter = document.getElementById("step-counter-footer");
		if (stepCounterFooter) {
			stepCounterFooter.textContent = stepText;
			stepCounterFooter.style.visibility = "visible";
		}
		const stepCounter = document.getElementById("step-counter");
		if (stepCounter) {
			stepCounter.textContent = stepText;
			stepCounter.style.visibility = "visible";
		}
	}

	onPlayPauseClick() {
		if (!this.controller) return;

		if (this.controller.isPlaying) {
			this.controller.pause();
		} else {
			this.controller.play();
		}

		// 버튼 아이콘 업데이트 (HTML ID: play-btn)
		const btn =
			document.getElementById("play-btn") ||
			document.getElementById("play-pause-btn");
		if (btn) {
			btn.textContent = this.controller.isPlaying ? "⏸" : "▶";
		}
		const btnFooter = document.getElementById("play-btn-footer");
		if (btnFooter) {
			btnFooter.textContent = this.controller.isPlaying ? "⏸" : "▶";
		}
	}

	onNextClick() {
		if (this.controller) {
			this.controller.next();
		}
	}

	onPrevClick() {
		if (this.controller) {
			this.controller.prev();
		}
	}

	onResetClick() {
		if (this.controller) {
			this.controller.reset();
		}
	}

	onSpeedChange(value) {
		if (this.controller) {
			const ms = Math.round(3000 / parseFloat(value)); // 배속 → ms 변환
			this.controller.setSpeed(ms);
		}
	}

	toggleTheme() {
		this.theme = this.theme === "dark" ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", this.theme);
		localStorage.setItem("binarySearchTheme", this.theme);
		this.updateThemeIcon();
	}

	updateThemeIcon() {
		const themeToggle = document.getElementById("theme-toggle");
		if (themeToggle) {
			// 다크모드일 때 🌓(반달), 라이트모드일 때 ☀️(태양)
			themeToggle.textContent = this.theme === "dark" ? "🌓" : "☀️";
		}
	}

	_generateRandomArray() {
		const size = 10;
		const set = new Set();
		while (set.size < size) {
			set.add(Math.floor(Math.random() * 57) + 3); // 3~59
		}
		return [...set].sort((a, b) => a - b);
	}

	_pickRandomTarget(array) {
		// 첫 mid(인덱스 4~5)를 피하되, 다양한 위치에서 선택 → 최소 3단계 보장
		// 좋은 후보: 인덱스 0,1,2, 7,8,9 (양쪽 끝 3개씩)
		const good = [0, 1, 2, 7, 8, 9].filter((i) => i < array.length);
		const idx = good[Math.floor(Math.random() * good.length)];
		return array[idx];
	}

	updateProgressBar() {
		const sectionIds = ["visualizer", "code", "quiz", "complexity"];
		const currentIndex = sectionIds.indexOf(this.currentSection);
		// currentIndex가 -1이면 0으로 처리
		const safeIndex = currentIndex >= 0 ? currentIndex : 0;
		const progress = ((safeIndex + 1) / sectionIds.length) * 100;

		const progressBar = document.querySelector(".progress-bar");
		if (progressBar) {
			progressBar.style.width = `${progress}%`;
		}
		const progressContainer = document.querySelector(".progress-bar-container");
		if (progressContainer) {
			progressContainer.setAttribute("aria-valuenow", Math.round(progress));
		}

		// step-display (header) 또는 .step-text 클래스 모두 업데이트
		const stepDisplay = document.getElementById("step-display");
		if (stepDisplay) {
			stepDisplay.textContent = `Step ${safeIndex + 1} / ${sectionIds.length}`;
		}
		const stepText = document.querySelector(".step-text");
		if (stepText && stepText !== stepDisplay) {
			stepText.textContent = `Step ${safeIndex + 1} / ${sectionIds.length}`;
		}
	}
}
