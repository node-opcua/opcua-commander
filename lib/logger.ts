import { format } from "util";

let logBuffer: string[] = [];
let logWindow: any = null;
const oldConsoleLog = console.log;

export function initLogger() {
  console.log = (...args: any[]) => {
    const str = format(args[0], ...args.slice(1));
    if (logWindow) {
      str.split("\n").forEach((line) => logWindow.addItem(line));
      logWindow.select(logWindow.items.length - 1);
      logWindow.screen.render();
    } else {
      logBuffer.push(str);
      // Also call old console log so it's visible before blessed starts
      oldConsoleLog.apply(console, args);
    }
  };
}

export function setLogWindow(window: any) {
  logWindow = window;
  if (logWindow && logBuffer.length > 0) {
    logBuffer.forEach((str) => {
      str.split("\n").forEach((line) => logWindow.addItem(line));
    });
    logBuffer = [];
    logWindow.select(logWindow.items.length - 1);
    logWindow.screen.render();
  }
}
