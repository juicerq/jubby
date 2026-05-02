import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { setupAutoUpdate } from "@main/auto-update";
import { startOrpcServer } from "@main/ipc";
import { Logger } from "@main/logger";
import { type SettingsValue, Settings } from "@main/store/settings";
import { setMainWindow } from "@main/window";

const here = import.meta.dirname;

process.on("uncaughtException", (err) => {
	Logger.error("uncaughtException", { err: String(err), stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
	Logger.error("unhandledRejection", { reason: String(reason) });
});

function debounce<A extends unknown[]>(
	fn: (...args: A) => unknown,
	ms: number,
) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (...args: A) => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => fn(...args), ms);
	};
}

async function createWindow() {
	const settings = await Settings.get().catch(
		(err): SettingsValue => {
			Logger.error("settings:read-failed", { err: String(err) });
			return {};
		},
	);
	const saved = settings.windowBounds;

	const win = new BrowserWindow({
		width: saved?.width ?? 960,
		height: saved?.height ?? 640,
		x: saved?.x,
		y: saved?.y,
		frame: false,
		webPreferences: {
			preload: join(here, "../preload/index.cjs"),
			sandbox: true,
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.setIcon(join(here, "../../build/icon.png"));
	setMainWindow(win);

	if (saved?.maximized) {
		win.maximize();
	}

	const saveBounds = debounce(() => {
		Settings.update({
			windowBounds: {
				...win.getNormalBounds(),
				maximized: win.isMaximized(),
			},
		}).catch((err) =>
			Logger.error("settings:windowBounds-save-failed", { err: String(err) }),
		);
	}, 500);

	win.on("resize", saveBounds);
	win.on("move", saveBounds);
	win.on("maximize", saveBounds);
	win.on("unmaximize", saveBounds);

	if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
		win.loadURL(process.env.ELECTRON_RENDERER_URL);
		win.webContents.openDevTools({ mode: "detach" });
	} else {
		win.loadFile(join(here, "../renderer/index.html"));
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
app.whenReady().then(() => {
	startOrpcServer();
	setupAutoUpdate();

	createWindow().catch((err) => {
		Logger.error("createWindow:failed", { err: String(err) });
	});
});

app.on("window-all-closed", () => app.quit());
