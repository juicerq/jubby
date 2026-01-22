import { useEffect, useRef } from "react";
import {
	type NavigationLevel,
	useNavigation,
} from "@/core/context/NavigationContext";

function serializeLevels(
	levels: (NavigationLevel | null | undefined | false)[],
): string {
	return levels
		.filter((l): l is NavigationLevel => Boolean(l))
		.map((l) => `${l.id}:${l.label}`)
		.join("/");
}

/**
 * Declaratively set navigation levels based on plugin state.
 * Levels auto-update when the array changes (IDs or labels).
 *
 * @example
 * useNavigationLevels([
 *   { id: 'tasks', label: 'Tasks', onNavigate: () => setFolder(null) },
 *   currentFolder && { id: `folder-${currentFolder.id}`, label: currentFolder.name }
 * ])
 */
function useNavigationLevels(
	levels: (NavigationLevel | null | undefined | false)[],
) {
	const { setLevels } = useNavigation();

	const filteredLevels = levels.filter((l): l is NavigationLevel => Boolean(l));
	const levelsKey = serializeLevels(levels);
	const prevLevelsKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (levelsKey !== prevLevelsKeyRef.current) {
			prevLevelsKeyRef.current = levelsKey;
			setLevels(filteredLevels);
		}
	}, [levelsKey, setLevels, filteredLevels]);

	useEffect(() => {
		return () => setLevels([]);
	}, [setLevels]);
}

export { useNavigationLevels };
