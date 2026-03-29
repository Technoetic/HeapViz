// 코드 패널: 반복형/재귀형 코드 표시 및 하이라이팅
class CodePanel {
	constructor(containerId) {
		this.container = document.getElementById(containerId);
		this.mode = "iterative";
		this.iterativeLines = [
			"function binarySearch(arr, target) {",
			"  let low = 0;",
			"  let high = arr.length - 1;",
			"  while (low <= high) {",
			"    let mid = low + Math.floor((high - low) / 2);",
			"    if (arr[mid] === target) {",
			"      return mid;              // ← 발견!",
			"    } else if (arr[mid] < target) {",
			"      low = mid + 1;           // ← 오른쪽 탐색",
			"    } else {",
			"      high = mid - 1;          // ← 왼쪽 탐색",
			"    }",
			"  }",
			"  return -1;                    // ← 미발견",
			"}",
		];
		this.recursiveLines = [
			"function binarySearchRecursive(arr, target, low, high) {",
			"  if (low > high) {",
			"    return -1;                  // ← 기저 조건",
			"  }",
			"  let mid = low + Math.floor((high - low) / 2);",
			"  if (arr[mid] === target) {",
			"    return mid;                 // ← 발견!",
			"  } else if (arr[mid] < target) {",
			"    return binarySearchRecursive(arr, target, mid + 1, high);",
			"  } else {",
			"    return binarySearchRecursive(arr, target, low, mid - 1);",
			"  }",
			"}",
		];
		this.currentHighlight = -1;
		this.codeLines = [];
		this.isFirstVisit = true;
	}

	init() {
		this.renderCode();
	}

	renderCode() {
		this.container.textContent = "";

		this.codeLines =
			this.mode === "iterative" ? this.iterativeLines : this.recursiveLines;

		this.codeLines.forEach((line, idx) => {
			const lineDiv = document.createElement("div");
			lineDiv.className = "code-line";
			lineDiv.setAttribute("data-line", idx);

			const lineNumber = document.createElement("span");
			lineNumber.className = "line-number";
			lineNumber.textContent = (idx + 1) + " ";
			lineDiv.appendChild(lineNumber);

			const lineText = document.createElement("span");
			lineText.className = "line-text";
			lineText.textContent = line;
			lineDiv.appendChild(lineText);

			this.container.appendChild(lineDiv);
		});

		// HTML의 기존 탭 버튼에 이벤트 바인딩
		const wrapper = this.container.closest(".code-panel-wrapper");
		if (wrapper) {
			const tabs = wrapper.querySelectorAll(".code-tab");
			tabs.forEach((tab) => {
				tab.addEventListener("click", () => {
					const mode = tab.getAttribute("data-mode");
					if (mode) this.switchMode(mode);
					tabs.forEach((t) => t.classList.remove("active"));
					tab.classList.add("active");
				});
			});
		}
	}

	switchMode(mode) {
		this.mode = mode;
		this.codeLines =
			mode === "iterative" ? this.iterativeLines : this.recursiveLines;
		this.renderCode();
		this.highlightLine(this.currentHighlight);
	}

	highlightLine(lineIndex) {
		// 기존 하이라이트 제거
		this.container.querySelectorAll(".code-line.active").forEach((line) => {
			line.classList.remove("active");
		});

		// 새 줄 하이라이트
		if (lineIndex >= 0 && lineIndex < this.codeLines.length) {
			const lineEl = this.container.querySelector(`[data-line="${lineIndex}"]`);
			if (lineEl) {
				lineEl.classList.add("active");
				this.currentHighlight = lineIndex;
			}
		}
	}

	escapeHtml(text) {
		const map = {
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#039;",
		};
		return text.replace(/[&<>"']/g, (char) => map[char]);
	}

	reset() {
		this.currentHighlight = -1;
		this.highlightLine(-1);
	}
}
