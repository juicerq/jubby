import type { EntityEventType } from "@shared/entity-constants";

type EntityEventData = {
	taskTitle?: string;
	folderName?: string;
};

type EntityEvent = {
	type: EntityEventType;
	data?: EntityEventData;
	timestamp: number;
};

type Listener = (event: EntityEvent) => void;

const listeners = new Set<Listener>();

export const entityBus = {
	emit(type: EntityEventType, data?: EntityEventData) {
		const event: EntityEvent = {
			type,
			timestamp: Date.now(),
			...(data ? { data } : {}),
		};
		for (const fn of listeners) fn(event);
	},

	on(fn: Listener): () => void {
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	},
};

export type { EntityEvent };
