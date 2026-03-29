// 애니메이션 제어: 재생/정지/속도 조절
class AnimationController {
	constructor(steps, onStepChange) {
		this.steps = steps;
		this.onStepChange = onStepChange;
		this.currentStep = 0;
		this.isPlaying = false;
		this.speed = 1500; // ms per step
		this.timer = null;
	}

	setSteps(steps) {
		this.steps = steps;
		this.currentStep = 0;
	}

	play() {
		if (this.isPlaying) return;
		this.isPlaying = true;

		this.timer = setInterval(() => {
			if (this.currentStep < this.steps.length - 1) {
				this.currentStep++;
				this.onStepChange(this.steps[this.currentStep]);
			} else {
				this.pause();
			}
		}, this.speed);
	}

	pause() {
		this.isPlaying = false;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	next() {
		this.pause();
		if (this.currentStep < this.steps.length - 1) {
			this.currentStep++;
			this.onStepChange(this.steps[this.currentStep]);
		}
	}

	prev() {
		this.pause();
		if (this.currentStep > 0) {
			this.currentStep--;
			this.onStepChange(this.steps[this.currentStep]);
		}
	}

	step(index) {
		this.pause();
		if (index >= 0 && index < this.steps.length) {
			this.currentStep = index;
			this.onStepChange(this.steps[this.currentStep]);
		}
	}

	setSpeed(ms) {
		this.speed = ms;
		if (this.isPlaying) {
			this.pause();
			this.play();
		}
	}

	reset() {
		this.pause();
		this.currentStep = 0;
		this.onStepChange(this.steps[0]);
	}
}
