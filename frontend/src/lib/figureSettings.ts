const KEY = "resector_analyze_figures";

export function getAnalyzeFigures(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyzeFigures(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // storage unavailable: the toggle just won't persist
  }
}
