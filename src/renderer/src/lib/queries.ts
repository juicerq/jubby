import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "@renderer/lib/api";

export function useTaskInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
		queryClient.invalidateQueries({ queryKey: orpc.system.stats.key() });
	};
}

export function useFolderInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.folders.list.key() });
		queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
		queryClient.invalidateQueries({ queryKey: orpc.system.stats.key() });
	};
}

export function useTagInvalidation() {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: orpc.tags.key() });
		queryClient.invalidateQueries({ queryKey: orpc.tasks.key() });
	};
}
