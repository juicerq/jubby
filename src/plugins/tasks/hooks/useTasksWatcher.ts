import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";

const EVENT_NAME = "tasks:storage-updated";

interface StorageUpdatedPayload {
	folderId: string;
	version: number;
}

interface UseTasksWatcherOptions {
	onFolderUpdated: (folderId: string) => void;
	onFoldersUpdated?: () => void;
}

/**
 * Hook to listen for file system changes to tasks storage.
 *
 * Listens to the backend file watcher events and calls the appropriate
 * callback when storage files are modified externally (e.g., by AI or manual edit).
 *
 * Single listener at plugin root level - avoids multiple listeners per view.
 */
export function useTasksWatcher(options: UseTasksWatcherOptions): void {
	const { onFolderUpdated, onFoldersUpdated } = options;
	const lastVersionRef = useRef<Record<string, number>>({});

	const handleEvent = useCallback(
		(payload: StorageUpdatedPayload) => {
			const { folderId, version } = payload;

			// Skip duplicate events (same version for same folder)
			if (lastVersionRef.current[folderId] === version) {
				return;
			}
			lastVersionRef.current[folderId] = version;

			if (folderId === "folders") {
				onFoldersUpdated?.();
			} else {
				onFolderUpdated(folderId);
			}
		},
		[onFolderUpdated, onFoldersUpdated],
	);

	useEffect(() => {
		let unlisten: UnlistenFn | null = null;

		const setupListener = async () => {
			unlisten = await listen<StorageUpdatedPayload>(EVENT_NAME, (event) => {
				handleEvent(event.payload);
			});
		};

		setupListener();

		return () => {
			unlisten?.();
		};
	}, [handleEvent]);
}
