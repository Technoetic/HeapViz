import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname2 = dirname(fileURLToPath(import.meta.url));
const AnimationController = new Function(
	readFileSync(resolve(__dirname2, "./AnimationController.js"), "utf8") +
		"\nreturn AnimationController;",
)();

describe("AnimationController", () => {
	let controller;
	let mockCallback;
	let steps;

	beforeEach(() => {
		mockCallback = vi.fn();
		steps = ["step1", "step2", "step3", "step4", "step5"];
		controller = new AnimationController(steps, mockCallback);
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it("생성 - isPlaying false, speed 기본값, currentStep 0", () => {
		expect(controller.isPlaying).toBe(false);
		expect(controller.speed).toBe(1500);
		expect(controller.currentStep).toBe(0);
	});

	it("setSteps() - totalSteps 설정", () => {
		const newSteps = ["a", "b", "c"];
		controller.setSteps(newSteps);
		expect(controller.steps).toEqual(newSteps);
		expect(controller.currentStep).toBe(0);
	});

	it("next() - currentStep 증가, onStepChange 콜백 호출", () => {
		controller.next();
		expect(controller.currentStep).toBe(1);
		expect(mockCallback).toHaveBeenCalledWith("step2");
		expect(mockCallback).toHaveBeenCalledTimes(1);
	});

	it("prev() - currentStep 감소", () => {
		controller.currentStep = 2;
		mockCallback.mockClear();
		controller.prev();
		expect(controller.currentStep).toBe(1);
		expect(mockCallback).toHaveBeenCalledWith("step2");
	});

	it("next() - 마지막 스텝에서 증가 안 함", () => {
		controller.currentStep = 4; // steps.length - 1
		mockCallback.mockClear();
		controller.next();
		expect(controller.currentStep).toBe(4);
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it("prev() - 0에서 감소 안 함", () => {
		controller.currentStep = 0;
		mockCallback.mockClear();
		controller.prev();
		expect(controller.currentStep).toBe(0);
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it("play() - isPlaying true, 타이머 시작", () => {
		controller.play();
		expect(controller.isPlaying).toBe(true);
		expect(controller.timer).not.toBeNull();

		vi.advanceTimersByTime(controller.speed);
		expect(controller.currentStep).toBe(1);
		expect(mockCallback).toHaveBeenCalledWith("step2");
	});

	it("pause() - isPlaying false, 타이머 정지", () => {
		controller.play();
		expect(controller.isPlaying).toBe(true);

		controller.pause();
		expect(controller.isPlaying).toBe(false);
		expect(controller.timer).toBeNull();

		mockCallback.mockClear();
		vi.advanceTimersByTime(controller.speed);
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it("setSpeed() - speed 변경", () => {
		const newSpeed = 2000;
		controller.setSpeed(newSpeed);
		expect(controller.speed).toBe(newSpeed);
	});

	it("setSpeed() - 재생 중일 때 타이머 재설정", () => {
		controller.play();
		const oldTimer = controller.timer;

		controller.setSpeed(2000);
		expect(controller.timer).not.toBe(oldTimer);
		expect(controller.speed).toBe(2000);
		expect(controller.isPlaying).toBe(true);
	});

	it("reset() - currentStep 0, isPlaying false", () => {
		controller.currentStep = 3;
		controller.play();
		mockCallback.mockClear();

		controller.reset();
		expect(controller.currentStep).toBe(0);
		expect(controller.isPlaying).toBe(false);
		expect(mockCallback).toHaveBeenCalledWith("step1");
	});

	it("play() - 마지막 스텝 도달 시 자동 정지", () => {
		controller.currentStep = 4;
		controller.play();
		expect(controller.isPlaying).toBe(true);

		vi.advanceTimersByTime(controller.speed);
		expect(controller.isPlaying).toBe(false);
	});

	it("step() - 특정 인덱스로 이동", () => {
		mockCallback.mockClear();
		controller.step(2);
		expect(controller.currentStep).toBe(2);
		expect(mockCallback).toHaveBeenCalledWith("step3");
	});

	it("step() - 유효하지 않은 인덱스는 무시", () => {
		controller.currentStep = 1;
		mockCallback.mockClear();

		controller.step(10);
		expect(controller.currentStep).toBe(1);
		expect(mockCallback).not.toHaveBeenCalled();

		controller.step(-1);
		expect(controller.currentStep).toBe(1);
		expect(mockCallback).not.toHaveBeenCalled();
	});

	it("step() - 스텝 이동 시 재생 중인 경우 일시 정지", () => {
		controller.play();
		expect(controller.isPlaying).toBe(true);

		controller.step(2);
		expect(controller.isPlaying).toBe(false);
		expect(controller.currentStep).toBe(2);
	});

	it("연속 next() 호출", () => {
		mockCallback.mockClear();
		controller.next();
		controller.next();
		controller.next();

		expect(controller.currentStep).toBe(3);
		expect(mockCallback).toHaveBeenCalledTimes(3);
	});

	it("play() 도중 next() 호출 시 일시 정지", () => {
		controller.play();
		expect(controller.isPlaying).toBe(true);

		controller.next();
		expect(controller.isPlaying).toBe(false);
	});

	it("play() 호출 중복 - 이미 재생 중이면 무시", () => {
		controller.play();
		const timer = controller.timer;

		controller.play();
		expect(controller.timer).toBe(timer);
	});
});
