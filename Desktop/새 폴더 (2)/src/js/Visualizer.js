// 배열 바 시각화
class Visualizer {
	constructor(containerId) {
		this.containerId = containerId;
		this.container = document.getElementById(containerId);
		this.bars = [];
		// 포인터 컨테이너는 같은 부모(.array-container) 안의 첫 번째 것을 사용
		this.pointerContainer = this.container
			? this.container
					.closest(".array-container")
					?.querySelector(".pointer-container") ||
				document.querySelector("#visualization .pointer-container")
			: null;
		this.lowPointer = null;
		this.midPointer = null;
		this.highPointer = null;
	}

	init(array) {
		// 기존 바 제거
		this.container.innerHTML = "";
		this.bars = [];

		// 최대값 기준 높이 정규화
		const maxVal = Math.max(...array);
		const containerHeight = this.container.offsetHeight - 40;

		// 각 원소별 바 생성
		array.forEach((val, idx) => {
			const barHeight = (val / maxVal) * containerHeight;
			const barDiv = document.createElement("div");
			barDiv.className = "bar";
			barDiv.setAttribute("data-index", idx);

			// Safe DOM creation instead of innerHTML
			const label = document.createElement("span");
			label.className = "bar-label";
			label.textContent = val;
			barDiv.appendChild(label);

			barDiv.style.height = `${barHeight}px`;

			this.container.appendChild(barDiv);
			this.bars.push(barDiv);
		});

		// 포인터 컨테이너 초기화 (HTML 기존 요소를 재사용하거나 새로 생성)
		if (this.pointerContainer) {
			this.pointerContainer.innerHTML = "";
			const pointerDefs = [
				{ label: "low", cls: "pointer--low", id: "ptr-low-dyn" },
				{ label: "mid", cls: "pointer--mid", id: "ptr-mid-dyn" },
				{ label: "high", cls: "pointer--high", id: "ptr-high-dyn" },
			];
			pointerDefs.forEach((def) => {
				const ptr = document.createElement("div");
				ptr.className = `pointer ${def.cls}`;
				ptr.id = def.id;

				// Safe DOM creation instead of innerHTML
				const arrow = document.createElement("div");
				arrow.className = "pointer-arrow";
				arrow.textContent = "↓";
				ptr.appendChild(arrow);

				const labelEl = document.createElement("div");
				labelEl.className = "pointer-label";
				labelEl.textContent = def.label;
				ptr.appendChild(labelEl);

				this.pointerContainer.appendChild(ptr);
			});

			this.lowPointer = this.pointerContainer.querySelector(".pointer--low");
			this.midPointer = this.pointerContainer.querySelector(".pointer--mid");
			this.highPointer = this.pointerContainer.querySelector(".pointer--high");
		}

		this.reset();
	}

	update(step) {
		// 모든 바 초기화
		this.bars.forEach((bar) => {
			bar.classList.remove(
				"bar--in-range",
				"bar--mid",
				"bar--eliminated",
				"bar--found",
			);
		});

		if (step.result === "found") {
			// 찾은 바만 초록, 나머지 전부 eliminated
			this.bars.forEach((bar, i) => {
				if (i === step.mid) {
					bar.classList.add("bar--found");
				} else {
					bar.classList.add("bar--eliminated");
				}
			});
		} else {
			// 탐색 범위 강조
			for (let i = step.low; i <= step.high; i++) {
				this.bars[i].classList.add("bar--in-range");
			}

			// Mid 포인터 강조
			if (step.mid >= 0 && step.mid < this.bars.length) {
				this.bars[step.mid].classList.add("bar--mid");
			}

			// 제외 범위
			for (let i = 0; i < step.low; i++) {
				this.bars[i].classList.add("bar--eliminated");
			}
			for (let i = step.high + 1; i < this.bars.length; i++) {
				this.bars[i].classList.add("bar--eliminated");
			}
		}

		// 포인터 위치 업데이트
		this.updatePointers(step.low, step.mid, step.high);
	}

	updatePointers(low, mid, high) {
		if (!this.pointerContainer) return;

		const containerWidth = this.container.offsetWidth;
		const n = this.bars.length;
		if (n === 0 || containerWidth === 0) return;

		const barWidth = containerWidth / n;
		const halfBar = barWidth / 2;

		// 바 중앙 위치 (translateX(-50%)로 포인터 자체를 센터링)
		const posOf = (idx) => idx * barWidth + halfBar;

		// 같은 인덱스 포인터는 라벨 합치기, 근접하면 가로 밀기
		const minGap = 45;

		// 같은 인덱스끼리 그룹화
		const groups = {};
		const entries = [
			{ ptr: this.lowPointer, idx: low, name: "low" },
			{ ptr: this.midPointer, idx: mid, name: "mid" },
			{ ptr: this.highPointer, idx: high, name: "high" },
		];
		for (const e of entries) {
			if (!groups[e.idx]) groups[e.idx] = [];
			groups[e.idx].push(e);
		}

		// 모든 포인터 숨기기
		entries.forEach((e) => {
			e.ptr.classList.remove("active");
			e.ptr.style.display = "none";
			e.ptr.style.top = "";
		});

		// 그룹별로 대표 포인터만 표시, 라벨 합침
		const visiblePtrs = [];
		for (const idx in groups) {
			const group = groups[idx];
			const repr = group[0]; // 대표
			const mergedLabel = group.map((g) => g.name).join("/");
			const labelEl = repr.ptr.querySelector(".pointer-label");
			if (labelEl) labelEl.textContent = mergedLabel;
			repr.ptr.style.display = "";
			repr.ptr.style.left = posOf(Number(idx)) + "px";
			repr.ptr.style.top = "0px";
			repr.ptr.classList.add("active");
			visiblePtrs.push({ ptr: repr.ptr, pos: posOf(Number(idx)) });

			// 나머지는 숨김 유지
			for (let i = 1; i < group.length; i++) {
				group[i].ptr.classList.remove("active");
			}
		}

		// 근접한 포인터 가로 밀기
		visiblePtrs.sort((a, b) => a.pos - b.pos);
		for (let i = 1; i < visiblePtrs.length; i++) {
			if (visiblePtrs[i].pos - visiblePtrs[i - 1].pos < minGap) {
				visiblePtrs[i].pos = visiblePtrs[i - 1].pos + minGap;
				visiblePtrs[i].ptr.style.left = visiblePtrs[i].pos + "px";
			}
		}

		// 오른쪽 끝에서 라벨이 잘리지 않도록 위치 보정
		// translateX(-50%) 적용되므로 pos + 라벨절반 > containerWidth면 잘림
		visiblePtrs.forEach((p) => {
			const labelEl = p.ptr.querySelector(".pointer-label");
			const halfLabel = labelEl ? (labelEl.textContent.length * 7) / 2 : 15;
			if (p.pos + halfLabel > containerWidth) {
				p.pos = containerWidth - halfLabel - 2;
				p.ptr.style.left = p.pos + "px";
			}
			// 왼쪽 끝도 체크
			if (p.pos - halfLabel < 0) {
				p.pos = halfLabel + 2;
				p.ptr.style.left = p.pos + "px";
			}
		});

		// 컨테이너 높이 리셋
		if (this.pointerContainer) {
			this.pointerContainer.style.height = "48px";
		}

		if (this.lowPointer) this.lowPointer.classList.add("active");
		if (this.midPointer) this.midPointer.classList.add("active");
		if (this.highPointer) this.highPointer.classList.add("active");
	}

	reset() {
		this.bars.forEach((bar) => {
			bar.classList.remove(
				"bar--in-range",
				"bar--mid",
				"bar--eliminated",
				"bar--found",
			);
		});
		this.updatePointers(0, 0, this.bars.length - 1);
	}
}
