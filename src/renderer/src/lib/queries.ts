import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";

export function useFolderTaskInvalidation(folderId: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({
			queryKey: orpc.tasks.listByFolder.key({ input: { folderId } }),
		});
		queryClient.invalidateQueries({ queryKey: orpc.system.stats.key() });
	};
}

export function useFolderInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.folders.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.system.stats.key() });
	};
}
