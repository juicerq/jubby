import { useNavigate, useSearch } from "@tanstack/react-router";

export type TagSearch = { tagIds?: string[] };

export function validateTagSearch(search: Record<string, unknown>): TagSearch {
	const raw = search.tagIds;

	if (Array.isArray(raw)) {
		const tagIds = raw.filter((x): x is string => typeof x === "string");

		if (tagIds.length > 0) {
			return { tagIds };
		}
	}

	return {};
}

export function useTagFilter() {
	const search = useSearch({ strict: false }) as TagSearch;
	const navigate = useNavigate();
	const selectedTagIds = search.tagIds ?? [];

	const setTagIds = (next: string[]) => {
		navigate({
			to: ".",
			search: () => (next.length > 0 ? { tagIds: next } : {}),
			replace: true,
		});
	};

	const toggleTag = (id: string) => {
		setTagIds(
			selectedTagIds.includes(id)
				? selectedTagIds.filter((tid) => tid !== id)
				: [...selectedTagIds, id],
		);
	};

	return {
		selectedTagIds,
		isFiltering: selectedTagIds.length > 0,
		toggleTag,
		clear: () => setTagIds([]),
	};
}
