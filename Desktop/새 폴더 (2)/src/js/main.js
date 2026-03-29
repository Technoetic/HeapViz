// 초기화
document.addEventListener("DOMContentLoaded", () => {
	const app = new App();
	app.init();
	window.app = app; // 디버깅용 전역 접근
});
