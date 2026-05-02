import { base } from "@main/router/_base";
import { getMainWindow } from "@main/window";

export const windowRouter = {
	state: base.handler(() => {
		const win = getMainWindow();
		return { maximized: win?.isMaximized() ?? false };
	}),

	minimize: base.handler(() => {
		getMainWindow()?.minimize();
	}),

	toggleMaximize: base.handler(() => {
		const win = getMainWindow();

		if (win?.isMaximized()) {
			win.unmaximize();
		} else {
			win?.maximize();
		}

		return { maximized: win?.isMaximized() ?? false };
	}),

	close: base.handler(() => {
		getMainWindow()?.close();
	}),
};
