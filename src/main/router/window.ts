import { noInput } from "@main/router/_base";
import { getMainWindow } from "@main/window";

export const windowRouter = {
	state: noInput.handler(() => {
		const win = getMainWindow();
		return { maximized: win?.isMaximized() ?? false };
	}),

	minimize: noInput.handler(() => {
		getMainWindow()?.minimize();
	}),

	toggleMaximize: noInput.handler(() => {
		const win = getMainWindow();

		if (win?.isMaximized()) {
			win.unmaximize();
		} else {
			win?.maximize();
		}

		return { maximized: win?.isMaximized() ?? false };
	}),

	close: noInput.handler(() => {
		getMainWindow()?.close();
	}),
};
