import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";

const SESSION_KEY_PREFIX = "tasks_lastWorkingDirectory:";

function getSessionKey(folderId: string): string {
	return `${SESSION_KEY_PREFIX}${folderId}`;
}

interface UseWorkingDirectoryOptions {
	folderId: string;
	folderDefault: string;
}

export function useWorkingDirectory({
	folderId,
	folderDefault,
}: UseWorkingDirectoryOptions) {
	const [value, setValue] = useState(() => {
		// Priority: sessionStorage (last used for this folder) → folder default
		const sessionValue = sessionStorage.getItem(getSessionKey(folderId));
		if (sessionValue) {
			return sessionValue;
		}
		return folderDefault;
	});
	const [error, setError] = useState("");

	// Update value when folder changes or folder default changes
	useEffect(() => {
		const sessionValue = sessionStorage.getItem(getSessionKey(folderId));
		if (sessionValue) {
			setValue(sessionValue);
		} else {
			setValue(folderDefault);
		}
		setError("");
	}, [folderId, folderDefault]);

	const updateValue = useCallback(
		(nextValue: string) => {
			setValue(nextValue);
			setError("");
			if (nextValue.trim().length > 0) {
				sessionStorage.setItem(getSessionKey(folderId), nextValue);
			}
		},
		[folderId],
	);

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
		setValue(folderDefault);
		setError("");
		sessionStorage.removeItem(getSessionKey(folderId));
	}, [folderId, folderDefault]);

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
