// 이진탐색 엔진: 알고리즘 실행 및 단계 기록
class BinarySearchEngine {
	constructor() {
		this.steps = [];
	}

	run(array, target) {
		this.steps = [];
		return this._binarySearchIterative(array, target);
	}

	_binarySearchIterative(array, target) {
		let low = 0;
		let high = array.length - 1;
		let stepIndex = 0;

		// 초기 상태
		let mid = low + Math.floor((high - low) / 2);
		this.steps.push({
			stepIndex: stepIndex++,
			array: [...array],
			low,
			high,
			mid,
			comparison: "start",
			result: "searching",
			sourceCodeLine: 0,
			description: `초기 상태: low=${low}, high=${high}, mid=${mid}에서 탐색 시작`,
		});

		while (low <= high) {
			mid = low + Math.floor((high - low) / 2);
			let comparison = "start";
			let result = "searching";
			let description = "";
			let sourceCodeLine = 4;

			if (array[mid] === target) {
				comparison = "equal";
				result = "found";
				sourceCodeLine = 5;
				description = `발견! arr[${mid}]=${array[mid]} === ${target}`;
			} else if (array[mid] < target) {
				comparison = "less";
				sourceCodeLine = 8;
				low = mid + 1;
				description = `arr[${mid}]=${array[mid]} < ${target} → 오른쪽 탐색 (low=${low})`;
			} else {
				comparison = "greater";
				sourceCodeLine = 10;
				high = mid - 1;
				description = `arr[${mid}]=${array[mid]} > ${target} → 왼쪽 탐색 (high=${high})`;
			}

			this.steps.push({
				stepIndex: stepIndex++,
				array: [...array],
				low,
				high,
				mid,
				comparison,
				result,
				sourceCodeLine,
				description,
			});

			if (result === "found") {
				return { found: true, index: mid, steps: this.steps };
			}
		}

		return { found: false, index: -1, steps: this.steps };
	}

	_binarySearchRecursive(array, target, low, high, steps) {
		if (low > high) {
			return -1;
		}
		const mid = low + Math.floor((high - low) / 2);
		if (array[mid] === target) {
			return mid;
		} else if (array[mid] < target) {
			return this._binarySearchRecursive(array, target, mid + 1, high, steps);
		} else {
			return this._binarySearchRecursive(array, target, low, mid - 1, steps);
		}
	}
}
