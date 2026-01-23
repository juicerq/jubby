import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { LAST_WORKING_DIR_KEY } from "../constants";

export function useWorkingDirectory() {
	const [value, setValue] = useState(() => {
		return localStorage.getItem(LAST_WORKING_DIR_KEY) ?? "";
	});
	const [error, setError] = useState("");

	const updateValue = useCallback((nextValue: string) => {
		setValue(nextValue);
		setError("");
		if (nextValue.trim().length > 0) {
			localStorage.setItem(LAST_WORKING_DIR_KEY, nextValue);
		}
	}, []);

	const selectFolder = useCallback(async () => {
		try {
			const selected = await open({
				directory: true,
				multiple: false,
				title: "Select working directory",
			});
			if (selected) {
				updateValue(selected);
			}
		} catch (err) {
			console.error("Failed to open folder picker:", err);
		}
	}, [updateValue]);

	const validate = useCallback(() => {
		if (!value.trim()) {
			setError("Working directory is required");
			return false;
		}
		return true;
	}, [value]);

	const reset = useCallback(() => {
		setValue("");
		setError("");
	}, []);

	return {
		value,
		setValue: updateValue,
		error,
		setError,
		selectFolder,
		validate,
		reset,
	};
}
